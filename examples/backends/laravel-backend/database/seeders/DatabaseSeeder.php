<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        // Preflight both identities before writing to either store.
        FixtureData::guard('pgsql');
        FixtureData::guard('mongodb');
        $this->call([
            FileFixtureSeeder::class,
            RelationalPlaygroundSeeder::class,
            MongoPlaygroundSeeder::class,
        ]);
    }
}
