<?php

namespace App\Support;

use Brick\Math\BigDecimal;

/** Exact decimal handling for prices: strings in, strings out, no binary floating-point arithmetic. */
final class Money
{
    private const UNSIGNED = '/^\d{1,10}(\.\d{1,2})?$/';

    private const SIGNED = '/^-?\d{1,10}(\.\d{1,2})?$/';

    public static function isValid(mixed $value, bool $signed = false): bool
    {
        return self::text($value) !== null && preg_match($signed ? self::SIGNED : self::UNSIGNED, self::text($value)) === 1;
    }

    /** Normalise a validated value to a two-decimal string, e.g. 5 -> "5.00". */
    public static function normalize(mixed $value): string
    {
        return (string) BigDecimal::of(self::text($value))->toScale(2);
    }

    private static function text(mixed $value): ?string
    {
        // Floats arrive from JSON numbers (19.99). json_encode prints the shortest text that round-trips, so
        // 0.1 + 0.2 stays 0.30000000000000004 (rejected) instead of being rounded to 0.3 by a plain string cast.
        return match (true) {
            is_float($value) => json_encode($value),
            is_int($value) => (string) $value,
            is_string($value) => trim($value),
            default => null,
        };
    }
}
