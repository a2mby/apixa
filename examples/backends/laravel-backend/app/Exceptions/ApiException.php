<?php

namespace App\Exceptions;

use Illuminate\Http\JsonResponse;
use RuntimeException;

/** An expected failure with a stable machine-readable `code`, rendered as the standard error body. */
class ApiException extends RuntimeException
{
    /** @param  array<string, mixed>  $extra  Extra top-level keys such as `errors` or `results`. */
    public function __construct(
        public readonly int $status,
        public readonly string $errorCode,
        string $message,
        public readonly array $extra = [],
        public readonly array $headers = [],
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json(
            ['message' => $this->getMessage(), 'code' => $this->errorCode] + $this->extra,
            $this->status,
            $this->headers,
        );
    }
}
