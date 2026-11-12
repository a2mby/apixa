<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class FileFixtureSeeder extends Seeder
{
    public function run(): void
    {
        FixtureData::guard('pgsql');
        $fixtures = FixtureData::read('files/file-fixtures.json')->files;
        // Validate every source/destination before writing any fixture.
        foreach ($fixtures as $fixture) {
            $source = database_path('fixtures/files/'.$fixture->source);
            if (! str_starts_with($fixture->path, 'playground-fixtures/v1/') || str_contains($fixture->path, '..') || $fixture->disk !== 'local') {
                throw new RuntimeException('Fixture destination must remain in the private fixture namespace.');
            }
            if (filesize($source) !== $fixture->size_bytes || hash_file('sha256', $source) !== $fixture->sha256) {
                throw new RuntimeException("Fixture source does not match its manifest: $fixture->key");
            }
            $disk = Storage::disk('local');
            if ($disk->exists($fixture->path) && hash('sha256', $disk->get($fixture->path)) !== $fixture->sha256) {
                throw new RuntimeException("Refusing to overwrite changed fixture bytes: $fixture->key");
            }
        }
        foreach ($fixtures as $fixture) {
            $disk = Storage::disk('local');
            if (! $disk->exists($fixture->path) && ! $disk->put($fixture->path, file_get_contents(database_path('fixtures/files/'.$fixture->source)))) {
                throw new RuntimeException("Could not write fixture: $fixture->key");
            }
        }
    }
}
