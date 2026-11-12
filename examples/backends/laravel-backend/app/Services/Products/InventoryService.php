<?php

namespace App\Services\Products;

use App\Exceptions\ApiException;
use App\Models\Product;
use App\Support\Money;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Support\Facades\DB;

/**
 * Stock, price and activation changes.
 *
 * Concurrency: delta adjustments are a single conditional UPDATE, so simultaneous adjustments can neither be lost
 * nor oversell. Absolute writes (set stock/price/activation) lock the row and honour an optional If-Match ETag.
 */
class InventoryService
{
    public function __construct(private readonly ProductService $products) {}

    public function setStock(Product $product, int $stock, ?string $ifMatch): Product
    {
        return $this->locked($product, $ifMatch, fn (Product $p) => $p->forceFill(['stock' => $stock])->save());
    }

    public function setPrice(Product $product, mixed $price, ?string $ifMatch): Product
    {
        return $this->locked($product, $ifMatch, fn (Product $p) => $p->forceFill(['price' => Money::normalize($price)])->save());
    }

    /** Idempotent: setting the current state changes nothing, not even updated_at. */
    public function setActive(Product $product, bool $active, ?string $ifMatch): Product
    {
        return $this->locked($product, $ifMatch, fn (Product $p) => $p->forceFill(['active' => $active])->save());
    }

    /**
     * Atomically add `$delta` (negative to remove). 409 `insufficient_stock` if the result would be below zero,
     * 409 `stock_limit_exceeded` if it would overflow the column. No read-modify-write in PHP.
     */
    public function adjustStock(Product $product, int $delta): Product
    {
        $max = (int) config('products.max_stock');
        $rows = DB::select(
            'UPDATE products SET stock = (stock::bigint + ?::bigint)::integer, updated_at = now()
             WHERE id = ? AND workspace_id = ? AND stock::bigint + ?::bigint BETWEEN 0 AND ?::bigint RETURNING id',
            [$delta, $product->getKey(), $product->workspace_id, $delta, $max],
        );
        if ($rows === []) {
            $current = Product::query()->whereKey($product->getKey())->where('workspace_id', $product->workspace_id)->first()
                ?? throw new ModelNotFoundException;
            $over = $current->stock + $delta > $max;
            throw new ApiException(409, $over ? 'stock_limit_exceeded' : 'insufficient_stock',
                $over ? 'The adjustment would exceed the maximum stock.' : 'Not enough stock for this adjustment.',
                ['available' => (int) $current->stock, 'requested_delta' => $delta]);
        }

        return $product->refresh();
    }

    private function locked(Product $product, ?string $ifMatch, callable $change): Product
    {
        return DB::transaction(function () use ($product, $ifMatch, $change) {
            $locked = $this->products->lock($product);
            $this->products->assertCurrent($locked, $ifMatch);
            $change($locked);

            return $locked->refresh();
        });
    }
}
