<?php

namespace App\Http\Requests\Products;

/** PUT replaces every editable field (tags/attributes default to empty); PATCH changes only the fields sent. */
class UpdateProductRequest extends ProductFormRequest
{
    public function rules(): array
    {
        return $this->fieldRules($this->isMethod('PUT'), $this->route('product')->getKey());
    }
}
