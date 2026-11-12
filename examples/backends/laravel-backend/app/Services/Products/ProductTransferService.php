<?php

namespace App\Services\Products;

use App\Exceptions\ApiException;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Models\Workspace;
use App\Rules\JsonObject;
use App\Rules\PriceValue;
use App\Support\Money;
use Closure;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Import: parse everything (bounded by size and row count), validate every row, resolve SKU/slug conflicts against
 * one prefetch, then write in a single transaction. Export: stream rows in chunks from a consistent snapshot.
 */
class ProductTransferService
{
    public const EXPORT_COLUMNS = ['id', 'sku', 'slug', 'name', 'category', 'price', 'stock', 'active', 'tags', 'attributes', 'created_at', 'updated_at'];

    /** Columns accepted on import that carry no information to write. */
    private const READ_ONLY = ['id', 'workspace_id', 'created_at', 'updated_at'];

    private const WRITABLE = ['sku', 'slug', 'name', 'category', 'price', 'stock', 'active', 'tags', 'attributes'];

    /**
     * @param  'create'|'upsert'  $mode  create: an existing SKU is a row error. upsert: update it (same workspace only).
     * @param  'abort'|'skip'  $onError  abort: write nothing if any row is invalid. skip: write valid rows, report the rest.
     * @return array<string, mixed>
     */
    public function import(Workspace $workspace, string $path, string $format, string $mode, string $onError, bool $dryRun): array
    {
        [$rows, $errors] = $format === 'csv' ? $this->readCsv($path) : $this->readJson($path);
        if (count($rows) + count($errors) === 0) {
            throw new ApiException(422, 'empty_import', 'The file contains no product rows.');
        }
        if (count($rows) + count($errors) > config('products.import.max_rows')) {
            throw new ApiException(413, 'too_many_rows', 'The file has more than '.config('products.import.max_rows').' rows.');
        }

        $total = count($rows) + count($errors); // rows plus rows that could not even be parsed
        [$create, $update] = $this->plan($workspace, $rows, $mode, $errors);
        $report = fn (int $created, int $updated) => [
            'dry_run' => $dryRun, 'mode' => $mode, 'on_error' => $onError, 'total' => $total,
            'created' => $created, 'updated' => $updated, 'failed' => count($errors), 'errors' => $errors,
        ];

        if ($errors && $onError === 'abort' && ! $dryRun) {
            throw new ApiException(422, 'import_failed', 'The import was rejected: at least one row is invalid. Nothing was written.', ['data' => $report(0, 0)]);
        }
        if ($dryRun) {
            return $report(count($create), count($update));
        }

        try {
            DB::transaction(function () use ($create, $update) {
                foreach (array_chunk($create, 500) as $chunk) {
                    Product::insert($chunk);
                }
                foreach ($update as [$model, $fields]) {
                    $model->fill($fields)->save();
                }
            });
        } catch (UniqueConstraintViolationException) {
            throw new ApiException(409, 'import_conflict', 'A SKU or slug was taken by a concurrent change. Nothing was written; retry the import.');
        }

        return $report(count($create), count($update));
    }

    /**
     * @param  list<array{row: int, data: array<string, mixed>}>  $rows
     * @param  list<array<string, mixed>>  $errors  Appended to.
     * @return array{0: list<array<string, mixed>>, 1: list<array{Product, array<string, mixed>}>}
     */
    private function plan(Workspace $workspace, array $rows, string $mode, array &$errors): array
    {
        $skus = array_values(array_unique(array_filter(array_map(fn ($r) => $r['data']['sku'] ?? null, $rows), 'is_string')));
        $existing = collect();
        foreach (array_chunk($skus, 1000) as $chunk) {
            $existing = $existing->merge(Product::whereIn('sku', $chunk)->get()->keyBy('sku'));
        }
        $slugs = [];
        foreach ($rows as $r) {
            $slugs[] = $r['data']['slug'] ?? (isset($r['data']['sku']) && is_string($r['data']['sku']) ? Str::slug($r['data']['sku']) : null);
        }
        $slugOwner = [];
        foreach (array_chunk(array_values(array_unique(array_filter($slugs))), 1000) as $chunk) {
            $slugOwner += Product::whereIn('slug', $chunk)->pluck('id', 'slug')->all();
        }

        $create = $update = [];
        $seenSku = $seenSlug = [];
        $now = now();
        foreach ($rows as $r) {
            ['row' => $n, 'data' => $data] = $r;
            $sku = $data['sku'] ?? null;
            $found = is_string($sku) ? $existing->get($sku) : null;
            $isUpdate = $found !== null && $found->workspace_id === $workspace->getKey() && $mode === 'upsert';

            if ($found && ! $isUpdate) {
                $errors[] = $this->error($n, $sku, $mode === 'create' ? 'sku_exists' : 'sku_taken', ['sku' => [$mode === 'create' ? 'A product with this SKU already exists.' : 'This SKU belongs to a product in another workspace.']]);

                continue;
            }
            $validator = Validator::make($this->forValidation($data), $this->rules(! $isUpdate));
            if ($validator->fails()) {
                $errors[] = $this->error($n, $sku, 'invalid_row', $validator->errors()->toArray());

                continue;
            }
            if (isset($seenSku[$sku])) {
                $errors[] = $this->error($n, $sku, 'duplicate_in_file', ['sku' => ["Duplicate SKU; first seen on row {$seenSku[$sku]}."]]);

                continue;
            }
            $slug = $data['slug'] ?? ($isUpdate ? $found->slug : (Str::slug($sku) ?: null));
            if ($slug === null || (isset($slugOwner[$slug]) && $slugOwner[$slug] !== $found?->id) || (isset($seenSlug[$slug]))) {
                $errors[] = $this->error($n, $sku, 'slug_taken', ['slug' => ['This slug is already used by another product.']]);

                continue;
            }
            $seenSku[$sku] = $n;
            $seenSlug[$slug] = $n;

            $fields = $this->normalize($data) + ['slug' => $slug];
            if ($isUpdate) {
                $update[] = [$found, $fields];

                continue;
            }
            $create[] = [
                'id' => ProductService::newId(), 'workspace_id' => $workspace->getKey(), 'sku' => $sku, 'slug' => $slug,
                'name' => $fields['name'], 'category' => $fields['category'], 'price' => $fields['price'], 'stock' => $fields['stock'],
                'active' => $fields['active'] ?? true, 'tags' => json_encode($fields['tags'] ?? []), 'attributes' => json_encode($fields['attributes'] ?? (object) []),
                'created_at' => $now, 'updated_at' => $now,
            ];
        }

        return [$create, $update];
    }

    /** @return array<string, mixed> */
    private function rules(bool $create): array
    {
        $req = $create ? 'required' : 'sometimes';

        return [
            'sku' => ['required', 'string', 'max:100', 'regex:/^[A-Za-z0-9][A-Za-z0-9._\-]*$/'],
            'slug' => ['sometimes', 'string', 'max:255', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/'],
            'name' => [$req, 'string', 'min:1', 'max:255'],
            'category' => [$req, 'string', 'min:1', 'max:100'],
            'price' => [$req, new PriceValue],
            'stock' => [$req, 'integer', 'min:0', 'max:'.config('products.max_stock')],
            'active' => ['sometimes', 'boolean'],
            'tags' => ['sometimes', 'array', 'max:50'],
            'tags.*' => ['string', 'min:1', 'max:50', 'distinct'],
            'attributes' => ['sometimes', new JsonObject],
        ];
    }

    /** @param  array<string, mixed>  $data */
    private function normalize(array $data): array
    {
        if (isset($data['price'])) {
            $data['price'] = Money::normalize($data['price']);
        }
        if (isset($data['stock'])) {
            $data['stock'] = (int) $data['stock'];
        }
        if (isset($data['active'])) {
            $data['active'] = filter_var($data['active'], FILTER_VALIDATE_BOOLEAN);
        }
        if (isset($data['tags'])) {
            $data['tags'] = array_values($data['tags']);
        }
        if (isset($data['attributes'])) {
            // Round-trip through JSON so nested arrays become objects; an empty value is {}.
            $decoded = json_decode(json_encode($data['attributes']));
            $data['attributes'] = is_object($decoded) ? $decoded : (object) [];
        }

        return $data;
    }

    /** The validator wants arrays; the stored value keeps its objects so `{}` stays `{}`. @param  array<string, mixed>  $data */
    private function forValidation(array $data): array
    {
        if (isset($data['attributes']) && is_object($data['attributes'])) {
            $data['attributes'] = json_decode(json_encode($data['attributes']), true);
        }

        return $data;
    }

    /** @return array<string, mixed> */
    private function error(int $row, mixed $sku, string $code, array $errors): array
    {
        return ['row' => $row, 'sku' => is_string($sku) ? $sku : null, 'code' => $code, 'errors' => $errors];
    }

    // ---- parsing -------------------------------------------------------------------------------------------

    /** @return array{0: list<array{row: int, data: array<string, mixed>}>, 1: list<array<string, mixed>>} */
    private function readCsv(string $path): array
    {
        $handle = fopen($path, 'rb');
        $header = $this->csvLine($handle);
        if ($header === null) {
            throw new ApiException(422, 'empty_import', 'The file contains no product rows.');
        }
        $header[0] = preg_replace('/^\xEF\xBB\xBF/', '', (string) $header[0]);
        if (! mb_check_encoding(implode('', $header), 'UTF-8')) {
            fclose($handle);
            throw new ApiException(422, 'invalid_file', 'The CSV file must be UTF-8 text.', ['errors' => ['file' => ['The CSV file must be UTF-8 text.']]]);
        }
        $columns = array_map(fn ($c) => strtolower(trim((string) $c)), $header);
        $unknown = array_diff($columns, self::WRITABLE, self::READ_ONLY);
        if (! in_array('sku', $columns, true) || count($columns) !== count(array_unique($columns)) || $unknown) {
            fclose($handle);
            throw new ApiException(422, 'invalid_file', 'The CSV header must include "sku", have no duplicate columns and use only: '.implode(', ', array_merge(self::WRITABLE, self::READ_ONLY)).'.', ['errors' => ['file' => ['Unsupported CSV columns: '.implode(', ', $unknown ?: ['(missing sku or duplicates)'])]]]);
        }

        $rows = $errors = [];
        for ($line = 2; ($cells = $this->csvLine($handle)) !== null; $line++) {
            if ($cells === [null]) {
                continue; // blank line
            }
            if (count($cells) !== count($columns) || ! mb_check_encoding(implode('', $cells), 'UTF-8')) {
                $errors[] = $this->error($line, null, 'malformed_row', ['row' => ['Wrong number of cells or invalid UTF-8.']]);

                continue;
            }
            $data = [];
            foreach (array_combine($columns, $cells) as $column => $cell) {
                if (in_array($column, self::READ_ONLY, true) || trim($cell) === '') {
                    continue; // empty cell = not provided
                }
                $data[$column] = $this->csvValue($column, $cell);
            }
            $rows[] = ['row' => $line, 'data' => $data];
            if (count($rows) + count($errors) > config('products.import.max_rows')) {
                break;
            }
        }
        fclose($handle);

        return [$rows, $errors];
    }

    /** @return list<?string>|null */
    private function csvLine($handle): ?array
    {
        $cells = fgetcsv($handle, 0, ',', '"', '');

        return $cells === false ? null : $cells;
    }

    private function csvValue(string $column, string $cell): mixed
    {
        return match ($column) {
            'tags' => array_values(array_filter(array_map('trim', explode('|', $cell)), 'strlen')),
            'attributes' => (function () use ($cell) {
                $decoded = json_decode($cell);

                return json_last_error() === JSON_ERROR_NONE ? $decoded : $cell; // anything but an object fails JsonObject
            })(),
            'active' => match (strtolower(trim($cell))) {
                'true', 'yes', '1' => true,
                'false', 'no', '0' => false,
                default => $cell,
            },
            default => $cell,
        };
    }

    /** @return array{0: list<array{row: int, data: array<string, mixed>}>, 1: list<array<string, mixed>>} */
    private function readJson(string $path): array
    {
        $text = preg_replace('/^\xEF\xBB\xBF/', '', (string) file_get_contents($path));
        $decoded = json_decode($text, false, 64);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new ApiException(422, 'invalid_file', 'The file is not valid JSON.', ['errors' => ['file' => ['The file is not valid JSON.']]]);
        }
        $list = is_object($decoded) && isset($decoded->products) ? $decoded->products : $decoded;
        if (! is_array($list)) {
            throw new ApiException(422, 'invalid_file', 'Expected a JSON array of products or {"products": [...]}.', ['errors' => ['file' => ['Expected a JSON array of products or {"products": [...]}.']]]);
        }

        $rows = $errors = [];
        foreach ($list as $i => $item) {
            $n = $i + 1;
            if (! is_object($item)) {
                $errors[] = $this->error($n, null, 'malformed_row', ['row' => ['Each product must be a JSON object.']]);

                continue;
            }
            $data = [];
            foreach (get_object_vars($item) as $key => $value) {
                if (in_array($key, self::READ_ONLY, true)) {
                    continue;
                }
                $data[$key] = $value;
            }
            if ($unknown = array_diff(array_keys($data), self::WRITABLE)) {
                $errors[] = $this->error($n, $data['sku'] ?? null, 'invalid_row', ['row' => ['Unknown fields: '.implode(', ', $unknown).'.']]);

                continue;
            }
            $rows[] = ['row' => $n, 'data' => $data];
        }

        return [$rows, $errors];
    }

    // ---- export --------------------------------------------------------------------------------------------

    /** Streams the query in chunks from one REPEATABLE READ snapshot. Output is never fully buffered. */
    public function stream(Builder $query, string $format): Closure
    {
        return function () use ($query, $format) {
            $write = function (string $chunk) {
                echo $chunk;
                if (PHP_SAPI !== 'cli') {
                    flush();
                }
            };
            $each = function (Closure $row) use ($query) {
                $work = function () use ($query, $row) {
                    foreach ($query->lazy((int) config('products.export.chunk_size')) as $product) {
                        if (connection_aborted()) { // client went away: stop reading
                            return false;
                        }
                        $row($product);
                    }

                    return true;
                };
                // A transaction pins one snapshot so concurrent writes cannot skip or repeat rows between chunks.
                if (DB::transactionLevel() === 0) {
                    DB::transaction(function () use ($work) {
                        DB::statement('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
                        $work();
                    });
                } else {
                    $work();
                }
            };

            $json = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION;
            $count = 0;
            if ($format === 'csv') {
                $write($this->csvRow(self::EXPORT_COLUMNS));
                $each(function (Product $p) use ($write, &$count, $json) {
                    $r = (new ProductResource($p))->resolve();
                    $write($this->csvRow(array_map(fn ($col) => match ($col) {
                        'tags' => implode('|', $r['tags']),
                        'attributes' => json_encode($r['attributes'], $json),
                        'active' => $r['active'] ? 'true' : 'false',
                        default => (string) $r[$col],
                    }, self::EXPORT_COLUMNS), neutralize: ['sku', 'slug', 'name', 'category', 'tags', 'attributes']));
                    $count++;
                });
            } elseif ($format === 'ndjson') {
                $each(function (Product $p) use ($write, $json) {
                    $write(json_encode((new ProductResource($p))->resolve(), $json)."\n");
                });
            } else {
                $write('{"data":[');
                $each(function (Product $p) use ($write, &$count, $json) {
                    $write(($count++ ? ',' : '').json_encode((new ProductResource($p))->resolve(), $json));
                });
                $write('],"meta":{"count":'.$count.',"exported_at":'.json_encode(now()->toIso8601String()).'}}');
            }
        };
    }

    /** @param  list<string>  $cells  @param  list<string>  $neutralize */
    private function csvRow(array $cells, array $neutralize = []): string
    {
        if ($neutralize) {
            foreach (self::EXPORT_COLUMNS as $i => $col) {
                // Spreadsheet formula injection: a text cell beginning with = + - @ is prefixed so it stays text.
                if (in_array($col, $neutralize, true) && isset($cells[$i][0]) && str_contains("=+-@\t\r", $cells[$i][0])) {
                    $cells[$i] = "'".$cells[$i];
                }
            }
        }
        $h = fopen('php://memory', 'w+');
        fputcsv($h, $cells, ',', '"', '', "\r\n");
        rewind($h);
        $line = stream_get_contents($h);
        fclose($h);

        return $line;
    }

    /** @return array<string, mixed> */
    public function preview(Builder $query, int $limit): array
    {
        $count = (clone $query)->reorder()->count();
        $sample = (clone $query)->limit($limit)->get()->map(fn (Product $p) => (new ProductResource($p))->resolve())->all();

        return [
            'count' => $count,
            'formats' => ['csv' => 'text/csv; charset=UTF-8', 'json' => 'application/json', 'ndjson' => 'application/x-ndjson'],
            'csv_columns' => self::EXPORT_COLUMNS,
            'sample' => $sample,
        ];
    }
}
