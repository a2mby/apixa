<?php

namespace Tests\Feature;

use App\Models\Mongo\MongoArticle;
use App\Models\Mongo\MongoProduct;
use App\Models\Mongo\MongoProfile;
use Database\Seeders\FixtureData;
use Database\Seeders\MongoPlaygroundSeeder;
use Illuminate\Support\Facades\DB;
use MongoDB\BSON\Decimal128;
use RuntimeException;
use Tests\TestCase;

class MongoPlaygroundDataTest extends TestCase
{
    public function test_document_upserts_are_repeatable_preserve_manual_rows_and_match_sources(): void
    {
        $this->seed(MongoPlaygroundSeeder::class);
        MongoProfile::create(['id' => 'qa-preserve-profile', 'contact_id' => 'qa-manual-contact', 'workspace_id' => 'ws-1', 'payload' => ['manual' => true]]);
        try {
            $this->seed(MongoPlaygroundSeeder::class);
            foreach (MongoPlaygroundSeeder::DATASETS as $dataset => $model) {
                $ids = array_column(FixtureData::records("mongodb/$dataset.json"), 'id');
                $this->assertSame(count($ids), $model::whereIn('id', $ids)->count());
            }
            $this->assertNotNull(MongoProfile::find('qa-preserve-profile'));
            $this->assertCount(2, MongoArticle::findOrFail('article-001')->comments);
            $this->assertSame(6, MongoProfile::where('payload.address.city', 'Amman')->count());
            $this->assertSame([], MongoArticle::findOrFail('article-063')->comments);
        } finally {
            MongoProfile::where('id', 'qa-preserve-profile')->delete();
        }
    }

    public function test_native_bson_retains_empty_object_array_and_decimal_price(): void
    {
        $this->seed(MongoPlaygroundSeeder::class);
        $db = DB::connection('mongodb')->getDatabase();
        $profile = $db->selectCollection('profiles')->findOne(['_id' => 'profile-001'], ['typeMap' => ['root' => 'object', 'document' => 'object', 'array' => 'array']]);
        $this->assertInstanceOf(\stdClass::class, $profile->payload->emptyObject);
        $this->assertSame([], $profile->payload->emptyArray);
        $this->assertFalse(property_exists($profile->payload, 'optionalNote'));
        $product = $db->selectCollection('products')->findOne(['_id' => 'product-001']);
        $this->assertInstanceOf(Decimal128::class, $product['price']);
        $this->assertSame('1.37', MongoProduct::findOrFail('product-001')->price);
        $indexes = iterator_to_array($db->selectCollection('products')->listIndexes());
        $this->assertTrue(collect($indexes)->contains(fn ($index) => $index->isUnique() && array_key_exists('sku', $index->getKey())));
    }

    public function test_mongo_guard_rejects_wrong_database_before_writing(): void
    {
        config(['database.connections.mongodb.database' => 'unrelated_database']);
        $this->expectException(RuntimeException::class);
        FixtureData::guard('mongodb');
    }
}
