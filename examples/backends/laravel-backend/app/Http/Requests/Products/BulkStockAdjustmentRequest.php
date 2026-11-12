<?php

namespace App\Http\Requests\Products;

class BulkStockAdjustmentRequest extends BulkProductRequest
{
    public function rules(): array
    {
        $max = config('products.max_stock');

        return $this->envelope('items') + [
            'items.*.id' => ['required', 'string', 'max:100', 'distinct'],
            'items.*.delta' => ['required', 'integer', 'not_in:0', "between:-$max,$max"],
        ];
    }
}
