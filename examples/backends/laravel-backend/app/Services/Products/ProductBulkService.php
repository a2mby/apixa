<?php

namespace App\Services\Products;

use App\Exceptions\ApiException;
use App\Exceptions\ProductItemFailure;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Models\Workspace;
use App\Support\Money;
use Brick\Math\BigDecimal;
use Brick\Math\RoundingMode;
use Closure;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Bulk semantics
 * - Request-level validation (shape, limits, duplicate ids) fails the whole request with 422 before anything runs.
 * - Items are applied in request order inside one transaction; each item runs in its own savepoint.
 * - "atomic" (default): if any item fails, everything is rolled back and the response is 409 `bulk_atomic_failed`
 *   with a per-item report (applied items are reported as `rolled_back`).
 * - "partial": failed items are skipped, the rest commit; the response is 200 with a per-item report.
 * - Rows are locked in id order (FOR UPDATE) after one query, so no per-item reads and no lock-order deadlocks.
 */
class ProductBulkService
{
    public function __construct(private readonly ProductService $products) {}

    /** @param  list<array<string, mixed>>  $items  Each has an `id`, plus PATCH fields. */
    public function update(Workspace $workspace, array $items, string $transaction): array
    {
        return $this->run($workspace, $transaction, $items, function (Product $p, array $item) {
            $fields = array_diff_key($item, ['id' => 1]);
            $p->fill($this->products->normalize($fields))->save();

            return $p->refresh();
        });
    }

    /** @param  list<string>  $ids */
    public function delete(Workspace $workspace, array $ids, string $transaction): array
    {
        return $this->run($workspace, $transaction, $this->idItems($ids), function (Product $p) {
            $p->delete();

            return null;
        });
    }

    /** @param  list<string>  $ids */
    public function activate(Workspace $workspace, array $ids, bool $active, string $transaction): array
    {
        return $this->run($workspace, $transaction, $this->idItems($ids), fn (Product $p) => $this->persist($p, ['active' => $active]));
    }

    /** @param  list<string>  $ids */
    public function adjustPrices(Workspace $workspace, array $ids, string $operation, string $value, string $transaction): array
    {
        return $this->run($workspace, $transaction, $this->idItems($ids), function (Product $p) use ($operation, $value) {
            $current = BigDecimal::of((string) $p->price);
            $next = match ($operation) {
                'set' => BigDecimal::of($value),
                'add' => $current->plus($value),
                'percent' => $current->multipliedBy(BigDecimal::of('100')->plus($value))->dividedBy('100', 2, RoundingMode::HalfUp),
            };
            $next = $next->toScale(2, RoundingMode::HalfUp);
            if ($next->isNegative() || ! Money::isValid((string) $next)) {
                throw new ProductItemFailure('invalid_price', 'The resulting price is outside the allowed range.', ['price' => ['The resulting price would be '.$next.'.']]);
            }

            return $this->persist($p, ['price' => (string) $next]);
        });
    }

    /** @param  list<array{id: string, delta: int}>  $items */
    public function adjustStock(Workspace $workspace, array $items, string $transaction): array
    {
        return $this->run($workspace, $transaction, $items, function (Product $p, array $item) {
            $next = $p->stock + $item['delta'];
            if ($next < 0 || $next > config('products.max_stock')) {
                throw new ProductItemFailure($next < 0 ? 'insufficient_stock' : 'stock_limit_exceeded', $next < 0 ? 'Not enough stock for this adjustment.' : 'The adjustment would exceed the maximum stock.', ['delta' => ["Available stock is {$p->stock}."]]);
            }

            return $this->persist($p, ['stock' => $next]);
        });
    }

    /**
     * @param  list<array<string, mixed>>  $items
     * @param  Closure(Product, array): ?Product  $operation  Returns the updated product, or null when deleted.
     * @return array<string, mixed> The response `data` object.
     */
    private function run(Workspace $workspace, string $transaction, array $items, Closure $operation): array
    {
        $ids = array_column($items, 'id');
        $results = [];

        try {
            DB::transaction(function () use ($workspace, $items, $ids, $operation, $transaction, &$results) {
                $rows = $workspace->products()->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id');
                foreach ($items as $index => $item) {
                    $results[$index] = $this->applyOne($rows->get($item['id']), $item, $operation);
                }
                if ($transaction === 'atomic' && collect($results)->contains('status', 'error')) {
                    throw new RuntimeException('rollback');
                }
            }, attempts: 3);
        } catch (RuntimeException $e) {
            if ($e->getMessage() !== 'rollback') {
                throw $e;
            }
            $results = array_map(fn ($r) => $r['status'] === 'ok' ? ['id' => $r['id'], 'status' => 'rolled_back'] : $r, $results);
            throw new ApiException(409, 'bulk_atomic_failed', 'The bulk operation was rolled back because at least one item failed.', ['data' => $this->summary($transaction, $results, committed: false)]);
        }

        return ['data' => $this->summary($transaction, $results, committed: true)];
    }

    /** @param  array<string, mixed>  $item */
    private function applyOne(?Product $product, array $item, Closure $operation): array
    {
        $id = $item['id'];
        if (! $product) {
            return ['id' => $id, 'status' => 'error', 'error' => ['code' => 'not_found', 'message' => 'No product with this id exists in the workspace.']];
        }
        try {
            $updated = DB::transaction(fn () => $operation($product, $item)); // savepoint per item
        } catch (ProductItemFailure $e) {
            return ['id' => $id, 'status' => 'error', 'error' => $e->toArray()];
        } catch (UniqueConstraintViolationException $e) {
            $field = str_contains($e->getMessage(), 'products_slug_unique') ? 'slug' : 'sku';

            return ['id' => $id, 'status' => 'error', 'error' => ['code' => 'duplicate_value', 'message' => "The $field has already been taken.", 'errors' => [$field => ["The $field has already been taken."]]]];
        }

        return ['id' => $id, 'status' => 'ok'] + ($updated ? ['product' => (new ProductResource($updated))->resolve()] : ['deleted' => true]);
    }

    /** @param  list<array<string, mixed>>  $results */
    private function summary(string $transaction, array $results, bool $committed): array
    {
        $ok = count(array_filter($results, fn ($r) => $r['status'] === 'ok'));

        return [
            'transaction' => $transaction,
            'committed' => $committed,
            'requested' => count($results),
            'succeeded' => $ok,
            'failed' => count(array_filter($results, fn ($r) => $r['status'] === 'error')),
            'rolled_back' => count(array_filter($results, fn ($r) => $r['status'] === 'rolled_back')),
            'results' => array_values($results),
        ];
    }

    /** @param  array<string, mixed>  $attributes */
    private function persist(Product $product, array $attributes): Product
    {
        $product->forceFill($attributes)->save();

        return $product->refresh();
    }

    /** @param  list<string>  $ids */
    private function idItems(array $ids): array
    {
        return array_map(fn ($id) => ['id' => $id], $ids);
    }
}
