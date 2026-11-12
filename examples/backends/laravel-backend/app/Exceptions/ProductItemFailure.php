<?php

namespace App\Exceptions;

use RuntimeException;

/** One item of a bulk operation could not be applied. Never escapes the bulk service. */
class ProductItemFailure extends RuntimeException
{
    /** @param  array<string, list<string>>  $errors */
    public function __construct(public readonly string $errorCode, string $message, public readonly array $errors = [])
    {
        parent::__construct($message);
    }

    /** @return array{code: string, message: string, errors?: array<string, list<string>>} */
    public function toArray(): array
    {
        return ['code' => $this->errorCode, 'message' => $this->getMessage()] + ($this->errors ? ['errors' => $this->errors] : []);
    }
}
