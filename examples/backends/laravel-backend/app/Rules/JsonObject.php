<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;

/** Accepts a JSON object (including `{}`), rejects lists and oversized documents. */
class JsonObject implements ValidationRule
{
    public function __construct(private readonly int $maxBytes = 20000) {}

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! is_array($value) || ($value !== [] && array_is_list($value))) {
            $fail('The :attribute must be a JSON object.');

            return;
        }
        if (strlen((string) json_encode($value)) > $this->maxBytes) {
            $fail("The :attribute must not exceed {$this->maxBytes} bytes of JSON.");
        }
    }
}
