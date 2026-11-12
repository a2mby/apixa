<?php

namespace App\Http\Resources;

use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Product */
class ProductResource extends JsonResource
{
    public static $wrap = 'data';

    public function toArray(Request $request): array
    {
        $raw = $this->resource->getAttributes();
        // Decode the stored JSON directly so `{}` stays an object and `[]` stays a list at every depth.
        $attributes = json_decode($raw['attributes'] ?? '{}');

        return [
            'id' => $this->id,
            'workspace_id' => $this->workspace_id,
            'sku' => $this->sku,
            'slug' => $this->slug,
            'name' => $this->name,
            'category' => $this->category,
            'price' => (string) $this->price,
            'stock' => (int) $this->stock,
            'active' => (bool) $this->active,
            'tags' => $this->tags ?? [],
            'attributes' => is_object($attributes) ? $attributes : (object) [],
            // Always UTC, whatever time zone the database session uses.
            'created_at' => $this->created_at?->copy()->utc()->format('Y-m-d\\TH:i:s\\Z'),
            'updated_at' => $this->updated_at?->copy()->utc()->format('Y-m-d\\TH:i:s\\Z'),
        ];
    }
}
