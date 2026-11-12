<?php

namespace Database\Seeders;

use Illuminate\Support\Facades\DB;
use RuntimeException;

final class FixtureData
{
    public static function read(string $path): mixed
    {
        // Decode nested objects as objects: {} and [] must stay distinguishable.
        return json_decode(file_get_contents(database_path('fixtures/'.$path)), false, 512, JSON_THROW_ON_ERROR);
    }

    public static function records(string $path): array
    {
        $records = self::read($path);
        if (! is_array($records)) {
            throw new RuntimeException("Fixture must be a JSON array: $path");
        }
        $ids = [];
        foreach ($records as $record) {
            if (! is_object($record) || ! property_exists($record, 'id') || isset($ids[(string) $record->id])) {
                throw new RuntimeException("Fixture contains a missing or repeated ID: $path");
            }
            $ids[(string) $record->id] = true;
        }

        return array_map(fn ($record) => (array) $record, $records);
    }

    public static function guard(string $connection): void
    {
        $allowed = match (config('app.env')) {
            'local' => ['apixa_laravel_dev'],
            'testing' => ['apixa_laravel_test', 'apixa_laravel_e2e'],
            default => [],
        };
        $database = config("database.connections.$connection.database");
        if (! in_array($database, $allowed, true)) {
            throw new RuntimeException('Playground seeders only run in explicitly named local/testing playground databases.');
        }
        if ($connection === 'pgsql') {
            $actual = DB::connection('pgsql')->selectOne('select current_database() as name')->name;
        } else {
            $actual = DB::connection('mongodb')->getDatabase()->getDatabaseName();
        }
        // Check resolved identity as a DSN can override a configured database name.
        if ($actual !== $database) {
            throw new RuntimeException('Resolved database does not match the selected playground database.');
        }
    }
}
