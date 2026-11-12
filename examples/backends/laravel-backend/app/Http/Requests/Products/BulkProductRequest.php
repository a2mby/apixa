<?php

namespace App\Http\Requests\Products;

use Illuminate\Foundation\Http\FormRequest;

/** Shared bulk envelope: `transaction` is "atomic" (all or nothing, default) or "partial" (apply what can be applied). */
abstract class BulkProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    protected function envelope(string $listKey): array
    {
        $max = (int) config('products.bulk_max_items');

        return [
            'transaction' => ['sometimes', 'in:atomic,partial'],
            $listKey => ['required', 'array', 'min:1', "max:$max"],
        ];
    }

    public function transaction(): string
    {
        return (string) $this->input('transaction', 'atomic');
    }
}
