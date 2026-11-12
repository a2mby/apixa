<?php

namespace Database\Seeders;

use App\Models\Mongo\MongoArticle;
use App\Models\Mongo\MongoProduct;
use App\Models\Mongo\MongoProfile;
use Illuminate\Database\Seeder;

class MongoPlaygroundSeeder extends Seeder
{
    public const DATASETS = [
        'profiles' => MongoProfile::class,
        'products' => MongoProduct::class,
        'articles' => MongoArticle::class,
    ];

    public function run(): void
    {
        FixtureData::guard('mongodb');
        foreach (self::DATASETS as $dataset => $model) {
            foreach (FixtureData::records("mongodb/$dataset.json") as $record) {
                $model::updateOrCreate(['id' => $record['id']], $record);
            }
        }
        // Standalone local MongoDB has no multi-document transaction guarantee.
        // Each upsert is atomic; rerun this deterministic seeder after an interruption.
    }
}
