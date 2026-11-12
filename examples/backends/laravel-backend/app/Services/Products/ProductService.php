<?php

namespace App\Services\Products;

use App\Exceptions\ApiException;
use App\Models\Product;
use App\Models\Workspace;
use App\Support\Money;
use App\Support\ProductEtag;
use Closure;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class ProductService
{
    public static function newId(): string
    {
        return 'product-'.Str::lower((string) Str::ulid());
    }

    /** @param  array<string, mixed>  $data  Validated request fields. */
    public function create(Workspace $workspace, array $data): Product
    {
        $data = $this->normalize($data) + ['tags' => [], 'attributes' => (object) []];
        $data['slug'] ??= $this->uniqueSlug($data['name'], $data['sku']);

        // The transaction doubles as a savepoint, so a unique violation cannot poison an enclosing transaction.
        return $this->translateUniqueViolation(fn () => DB::transaction(function () use ($workspace, $data) {
            $product = new Product($data);
            $product->id = self::newId();
            $product->workspace_id = $workspace->getKey();
            $product->save();

            return $product->refresh();
        }));
    }

    /** @param  array<string, mixed>  $data */
    public function update(Product $product, array $data, ?string $ifMatch): Product
    {
        return $this->translateUniqueViolation(fn () => DB::transaction(function () use ($product, $data, $ifMatch) {
            $locked = $this->lock($product);
            $this->assertCurrent($locked, $ifMatch);
            $locked->fill($this->normalize($data))->save();

            return $locked->refresh();
        }));
    }

    public function delete(Product $product, ?string $ifMatch): void
    {
        DB::transaction(function () use ($product, $ifMatch) {
            $locked = $this->lock($product);
            $this->assertCurrent($locked, $ifMatch);
            $locked->delete();
        });
    }

    /**
     * Copies the editable fields. The original id is never reused; stock starts at 0 unless `copy_stock` is true.
     *
     * @param  array<string, mixed>  $options
     */
    public function duplicate(Product $source, array $options): Product
    {
        $base = $source->sku.'-COPY';
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $sku = $options['sku'] ?? $base.($attempt === 0 ? '' : '-'.($attempt + 1));
            $name = $options['name'] ?? $source->name.' (copy)';
            try {
                return $this->create(Workspace::findOrFail($source->workspace_id), [
                    'name' => $name,
                    'sku' => $sku,
                    'slug' => $options['slug'] ?? null,
                    'category' => $source->category,
                    'price' => (string) $source->price,
                    'stock' => ($options['copy_stock'] ?? false) ? $source->stock : 0,
                    'active' => $options['active'] ?? $source->active,
                    'tags' => $source->tags ?? [],
                    'attributes' => json_decode($source->getAttributes()['attributes'] ?? '{}') ?? (object) [],
                ]);
            } catch (ValidationException $e) {
                // Caller-chosen sku/slug that collides is a real 422; only generated values are retried.
                if (isset($options['sku']) || isset($options['slug']) || $attempt === 4) {
                    throw $e;
                }
            }
        }
        throw new ApiException(409, 'duplicate_failed', 'Could not generate a unique SKU for the copy.');
    }

    /** Re-read the row under a row lock; throws ModelNotFoundException (404) if it vanished or changed workspace. */
    public function lock(Product $product): Product
    {
        return Product::query()->whereKey($product->getKey())->where('workspace_id', $product->workspace_id)
            ->lockForUpdate()->first() ?? throw new ModelNotFoundException;
    }

    public function assertCurrent(Product $locked, ?string $ifMatch): void
    {
        if (! ProductEtag::matches($ifMatch, $locked)) {
            throw new ApiException(409, 'version_conflict', 'The product was modified since you loaded it. Reload it and try again.', ['current_etag' => ProductEtag::for($locked)], ['ETag' => ProductEtag::for($locked)]);
        }
    }

    /** @param  array<string, mixed>  $data */
    public function normalize(array $data): array
    {
        if (array_key_exists('price', $data)) {
            $data['price'] = Money::normalize($data['price']);
        }
        if (array_key_exists('tags', $data)) {
            $data['tags'] = array_values($data['tags'] ?? []);
        }
        if (array_key_exists('attributes', $data)) {
            $data['attributes'] = $data['attributes'] ?? (object) [];
            if ($data['attributes'] === []) {
                $data['attributes'] = (object) [];
            }
        }

        return $data;
    }

    private function uniqueSlug(string $name, string $sku): string
    {
        $base = Str::slug($name) ?: Str::slug($sku) ?: 'product';
        $slug = $base;
        for ($i = 2; Product::where('slug', $slug)->exists(); $i++) {
            $slug = $base.'-'.$i;
        }

        return $slug;
    }

    /** Turns a race on the unique indexes into the same 422 a pre-check would have produced. */
    public function translateUniqueViolation(Closure $work): mixed
    {
        try {
            return $work();
        } catch (UniqueConstraintViolationException $e) {
            $field = str_contains($e->getMessage(), 'products_slug_unique') ? 'slug' : 'sku';
            throw ValidationException::withMessages([$field => ["The $field has already been taken."]]);
        }
    }
}
