<?php

namespace App\Http\Requests\Products;

use App\Rules\JsonObject;
use App\Rules\PriceValue;

/** Each item is `{id, ...fields}` with PATCH semantics. Uniqueness is checked per item against the database. */
class BulkUpdateRequest extends BulkProductRequest
{
    public function rules(): array
    {
        $max = config('products.max_stock');

        return $this->envelope('items') + [
            'items.*.id' => ['required', 'string', 'max:100', 'distinct'],
            'items.*.name' => ['sometimes', 'string', 'min:1', 'max:255'],
            'items.*.slug' => ['sometimes', 'string', 'max:255', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', 'distinct'],
            'items.*.sku' => ['sometimes', 'string', 'max:100', 'regex:/^[A-Za-z0-9][A-Za-z0-9._\-]*$/', 'distinct'],
            'items.*.category' => ['sometimes', 'string', 'min:1', 'max:100'],
            'items.*.price' => ['sometimes', new PriceValue],
            'items.*.stock' => ['sometimes', 'integer', 'min:0', "max:$max"],
            'items.*.active' => ['sometimes', 'boolean'],
            'items.*.tags' => ['sometimes', 'nullable', 'array', 'max:50'],
            'items.*.tags.*' => ['string', 'min:1', 'max:50', 'distinct'],
            'items.*.attributes' => ['sometimes', 'nullable', new JsonObject],
            'items.*.workspace_id' => ['prohibited'],
        ];
    }

    /** Validated items with raw `attributes` objects preserved. @return list<array<string, mixed>> */
    public function items(): array
    {
        $items = $this->validated()['items'];
        $raw = json_decode($this->getContent());
        foreach ($items as $i => $item) {
            if (isset($raw->items[$i]->attributes) && is_object($raw->items[$i]->attributes)) {
                $items[$i]['attributes'] = $raw->items[$i]->attributes;
            }
        }

        return $items;
    }
}
