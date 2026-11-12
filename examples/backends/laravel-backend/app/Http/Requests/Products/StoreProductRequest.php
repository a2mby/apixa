<?php

namespace App\Http\Requests\Products;

class StoreProductRequest extends ProductFormRequest
{
    public function rules(): array
    {
        // slug is optional on create: it is derived from the name.
        $rules = $this->fieldRules(true);
        $rules['slug'][0] = 'sometimes';

        return $rules;
    }
}
