<?php

namespace App\Http\Requests\Products;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

class ListProductsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    protected function prepareForValidation(): void
    {
        // Query strings carry booleans as text; accept the true/false a browser or Apixa serialises.
        foreach (['active', 'in_stock', 'low_stock'] as $key) {
            if (is_string($value = $this->query($key)) && in_array(strtolower($value), ['true', 'false'], true)) {
                $this->merge([$key => strtolower($value) === 'true']);
            }
        }

        // Lists may be sent as repeated keys (category[]=a&category[]=b) or comma separated (category=a,b).
        foreach (['category', 'tags'] as $key) {
            if (is_string($this->query($key))) {
                $this->merge([$key => array_values(array_filter(array_map('trim', explode(',', $this->query($key))), 'strlen'))]);
            }
        }
    }

    public function rules(): array
    {
        $max = (int) config('products.pagination.max');

        return [
            'q' => ['nullable', 'string', 'max:100'],
            'category' => ['sometimes', 'array', 'max:20'],
            'category.*' => ['string', 'max:100'],
            'active' => ['sometimes', 'boolean'],
            'price_min' => ['sometimes', 'numeric', 'min:0'],
            'price_max' => ['sometimes', 'numeric', 'min:0', 'gte:price_min'],
            'stock_min' => ['sometimes', 'integer', 'min:0'],
            'stock_max' => ['sometimes', 'integer', 'min:0', 'gte:stock_min'],
            'in_stock' => ['sometimes', 'boolean'],
            'low_stock' => ['sometimes', 'boolean'],
            'low_stock_threshold' => ['sometimes', 'integer', 'min:0', 'max:'.config('products.max_stock')],
            'tags' => ['sometimes', 'array', 'max:20'],
            'tags.*' => ['string', 'max:50'],
            'tags_match' => ['sometimes', 'in:any,all'],
            'attr' => ['sometimes', 'array', 'max:10'],
            'created_from' => ['sometimes', 'date'],
            'created_to' => ['sometimes', 'date', 'after_or_equal:created_from'],
            'updated_from' => ['sometimes', 'date'],
            'updated_to' => ['sometimes', 'date', 'after_or_equal:updated_from'],
            'sort' => ['sometimes', 'string', 'max:100'],
            'page' => ['sometimes', 'integer', 'min:1'],
            'per_page' => ['sometimes', 'integer', 'min:1', "max:$max"],
            'pagination' => ['sometimes', 'in:page,cursor'],
            'cursor' => ['sometimes', 'string', 'max:500'],
            'threshold' => ['sometimes', 'integer', 'min:0', 'max:'.config('products.max_stock')],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $this->validateSort($v);
            $this->validateAttributes($v);
        });
    }

    /** @return list<array{string, 'asc'|'desc'}> */
    public function sorts(): array
    {
        $sorts = [];
        foreach (array_filter(explode(',', (string) $this->query('sort', ''))) as $part) {
            $part = trim($part);
            $sorts[] = [ltrim($part, '-+ '), str_starts_with($part, '-') ? 'desc' : 'asc'];
        }

        return $sorts;
    }

    private function validateSort(Validator $v): void
    {
        $fields = array_column($this->sorts(), 0);
        $allowed = config('products.sortable');
        if (count($fields) > 3 || count($fields) !== count(array_unique($fields)) || array_diff($fields, $allowed)) {
            $v->errors()->add('sort', 'Sort must be up to 3 distinct fields from: '.implode(', ', $allowed).'. Prefix a field with "-" for descending order.');
        }
    }

    private function validateAttributes(Validator $v): void
    {
        $allowed = config('products.attributes');
        foreach ((array) $this->query('attr', []) as $path => $value) {
            if (! isset($allowed[$path])) {
                $v->errors()->add("attr.$path", 'Unsupported attribute filter. Allowed: '.implode(', ', array_keys($allowed)).'.');
            } elseif (! is_scalar($value) || $value === '' || strlen((string) $value) > 100) {
                $v->errors()->add("attr.$path", 'The attribute filter value must be a short scalar.');
            } elseif ($allowed[$path] === 'number' && ! is_numeric($value)) {
                $v->errors()->add("attr.$path", 'The attribute filter value must be numeric.');
            }
        }
    }
}
