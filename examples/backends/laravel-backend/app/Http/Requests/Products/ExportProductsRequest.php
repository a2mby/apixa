<?php

namespace App\Http\Requests\Products;

class ExportProductsRequest extends ListProductsRequest
{
    public function rules(): array
    {
        return parent::rules() + [
            'format' => ['sometimes', 'in:csv,json,ndjson'],
            'limit' => ['sometimes', 'integer', 'min:1', 'max:20'],
        ];
    }
}
