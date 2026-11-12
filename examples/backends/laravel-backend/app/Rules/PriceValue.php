<?php

namespace App\Rules;

use App\Support\Money;
use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

class PriceValue implements ValidationRule
{
    public function __construct(private readonly bool $signed = false) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! Money::isValid($value, $this->signed)) {
            $fail('The :attribute must be '.($this->signed ? 'a decimal' : 'a non-negative decimal').' with at most 10 integer digits and 2 decimal places.');
        }
    }
}
