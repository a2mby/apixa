<?php

namespace App\Support;

use App\Models\Product;

/** Content-based weak validator: changes whenever any stored column changes, independent of timestamp precision. */
final class ProductEtag
{
    public static function for(Product $product): string
    {
        $raw = $product->getAttributes();
        $parts = array_map(fn ($key) => is_scalar($raw[$key] ?? null) ? (string) $raw[$key] : json_encode($raw[$key] ?? null), [
            'id', 'workspace_id', 'sku', 'slug', 'name', 'category', 'price', 'stock', 'active', 'tags', 'attributes', 'updated_at',
        ]);

        return 'W/"'.substr(sha1(implode("\x1f", $parts)), 0, 32).'"';
    }

    /** True when an `If-Match` header value accepts the current representation. */
    public static function matches(?string $header, Product $product): bool
    {
        if ($header === null || trim($header) === '') {
            return true;
        }
        $current = self::for($product);
        foreach (explode(',', $header) as $candidate) {
            $candidate = trim($candidate);
            if ($candidate === '*' || $candidate === $current || 'W/'.$candidate === $current) {
                return true;
            }
        }

        return false;
    }
}
