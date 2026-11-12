<?php

namespace App\Http\Requests\Products;

use App\Rules\PriceValue;

/** Used by deletions, activation and price adjustments: one ids list plus an action-specific parameter. */
class BulkIdsRequest extends BulkProductRequest
{
    public function rules(): array
    {
        $extra = match (true) {
            $this->routeIs('products.bulk.activation') => ['active' => ['required', 'boolean']],
            $this->routeIs('products.bulk.prices') => [
                'operation' => ['required', 'in:set,add,percent'],
                'value' => ['required', new PriceValue(signed: $this->input('operation') !== 'set')],
            ],
            default => [],
        };

        return $this->envelope('ids') + ['ids.*' => ['required', 'string', 'max:100', 'distinct']] + $extra;
    }
}
