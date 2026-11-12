<?php

namespace App\Http\Requests\Products;

use App\Models\Product;
use App\Rules\JsonObject;
use App\Rules\PriceValue;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/** Shared field rules for create, replace and partial update. */
abstract class ProductFormRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // Workspace scoping is routing, not authorization.
    }

    /** @return array<string, mixed> */
    protected function fieldRules(bool $required, ?string $ignoreId = null, string $prefix = ''): array
    {
        $req = $required ? 'required' : 'sometimes';
        $rules = [
            'name' => [$req, 'string', 'min:1', 'max:255'],
            'slug' => [$required ? 'required' : 'sometimes', 'string', 'max:255', 'regex:/^[a-z0-9]+(?:-[a-z0-9]+)*$/', Rule::unique(Product::class, 'slug')->ignore($ignoreId)],
            'sku' => [$req, 'string', 'max:100', 'regex:/^[A-Za-z0-9][A-Za-z0-9._\-]*$/', Rule::unique(Product::class, 'sku')->ignore($ignoreId)],
            'category' => [$req, 'string', 'min:1', 'max:100'],
            'price' => [$req, new PriceValue],
            'stock' => [$req, 'integer', 'min:0', 'max:'.config('products.max_stock')],
            'active' => [$req, 'boolean'],
            'tags' => ['sometimes', 'nullable', 'array', 'max:50'],
            'tags.*' => ['string', 'min:1', 'max:50', 'distinct'],
            'attributes' => ['sometimes', 'nullable', new JsonObject],
            'workspace_id' => ['prohibited'],
            'id' => ['prohibited'],
        ];

        return $prefix === '' ? $rules : collect($rules)->mapWithKeys(fn ($r, $k) => [$prefix.$k => $r])->all();
    }

    /**
     * Validated fields with `attributes` taken from the raw body, so nested empty objects stay objects ({}), not lists ([]).
     *
     * @return array<string, mixed>
     */
    public function payload(): array
    {
        $data = $this->validated();
        $raw = json_decode($this->getContent());
        if ($this->isJson() && is_object($raw) && isset($raw->attributes) && is_object($raw->attributes)) {
            $data['attributes'] = $raw->attributes;
        }

        return $data;
    }
}
