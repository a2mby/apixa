<?php

namespace App\Http\Requests\Products;

use App\Rules\PriceValue;
use Illuminate\Foundation\Http\FormRequest;

/** Handles three bodies: {stock}, {delta} and {price}/{active}, chosen by route. */
class AdjustStockRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $max = config('products.max_stock');

        return match (true) {
            $this->routeIs('products.stock.set') => ['stock' => ['required', 'integer', 'min:0', "max:$max"]],
            $this->routeIs('products.price.set') => ['price' => ['required', new PriceValue]],
            $this->routeIs('products.activation.set') => ['active' => ['required', 'boolean']],
            default => ['delta' => ['required', 'integer', 'not_in:0', "between:-$max,$max"], 'reason' => ['sometimes', 'nullable', 'string', 'max:255']],
        };
    }
}
