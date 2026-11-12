<?php

namespace Tests\Feature;

use App\Models\Article;
use App\Models\Contact;
use App\Models\Counter;
use App\Models\Document;
use App\Models\NumericRecord;
use App\Models\Product;
use App\Models\Profile;
use App\Models\Workspace;
use Database\Seeders\FileFixtureSeeder;
use Database\Seeders\FixtureData;
use Database\Seeders\RelationalPlaygroundSeeder;
use Database\Seeders\ScalePlaygroundSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Tests\TestCase;

class PlaygroundDataTest extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RelationalPlaygroundSeeder::class);
    }

    public function test_all_twelve_sources_seed_without_duplicates_or_removing_manual_records(): void
    {
        Counter::create(['id' => 'qa-preserve-counter', 'workspace_id' => 'ws-1', 'value' => 17, 'version' => 1]);
        $this->seed(RelationalPlaygroundSeeder::class);
        foreach (RelationalPlaygroundSeeder::DATASETS as $dataset => $model) {
            $ids = array_column(FixtureData::records("records/$dataset.json"), 'id');
            $this->assertSame(count($ids), $model::whereIn('id', $ids)->count(), $dataset);
        }
        $this->assertSame(17, Counter::findOrFail('qa-preserve-counter')->value);
    }

    public function test_relations_eager_load_and_empty_workspace_is_really_empty(): void
    {
        $article = Article::with(['workspace', 'contact', 'comments.contact'])->findOrFail('article-001');
        $this->assertSame($article->workspace_id, $article->contact->workspace_id);
        $this->assertCount(2, $article->comments);
        $this->assertNotNull($article->comments->first()->contact);
        $this->assertSame(0, Workspace::findOrFail('ws-3')->contacts()->count());
        $this->assertCount(2, Document::with('links.contact')->findOrFail('document-001')->links);
        $contact = Contact::with('ownedDocuments')->findOrFail('contact-002');
        $this->assertIsArray($contact->documents);
        $this->assertCount(1, $contact->ownedDocuments);
    }

    public function test_jsonb_retains_objects_arrays_null_missing_keys_and_falsy_values(): void
    {
        $first = Profile::findOrFail('profile-001')->payload;
        $second = Profile::findOrFail('profile-002')->payload;
        $this->assertInstanceOf(\stdClass::class, $first->emptyObject);
        $this->assertSame([], $first->emptyArray);
        $this->assertSame(0, $first->zero);
        $this->assertFalse($first->enabled);
        $this->assertFalse(property_exists($first, 'optionalNote'));
        $this->assertTrue(property_exists($second, 'optionalNote'));
        $this->assertNull($second->optionalNote);
        $this->assertSame(6, Profile::where('payload->address->city', 'Amman')->count());
        $this->assertSame('1.37', Product::findOrFail('product-001')->price);
    }

    public function test_numeric_zero_uuid_and_partial_final_page_are_available(): void
    {
        $this->assertSame(0, NumericRecord::findOrFail(0)->id);
        $this->assertSame(3, Article::orderBy('rank')->orderBy('id')->paginate(10, ['*'], 'page', 7)->count());
        $this->assertTrue(DB::table('uuid_records')->whereRaw('pg_typeof(id)::text = ?', ['uuid'])->exists());
        $new = NumericRecord::create(['workspace_id' => 'ws-1', 'label' => 'Generated identity', 'value' => 0, 'enabled' => false]);
        $this->assertGreaterThan(19, $new->id);
    }

    public function test_composite_foreign_key_prevents_mismatched_contact_workspace(): void
    {
        try {
            DB::transaction(fn () => Article::findOrFail('article-001')->update(['workspace_id' => 'ws-1']));
            $this->fail('Expected the composite foreign key to reject the update.');
        } catch (QueryException $error) {
            $this->assertSame('23503', $error->errorInfo[0]);
        }
        $this->assertSame('ws-2', Article::findOrFail('article-001')->workspace_id);
    }

    public function test_real_unique_and_check_constraints_protect_the_database(): void
    {
        foreach ([
            ['23505', fn () => Product::findOrFail('product-001')->replicate()->forceFill(['id' => 'qa-duplicate-product'])->save()],
            ['23514', fn () => Product::findOrFail('product-001')->update(['stock' => -1])],
        ] as [$state, $operation]) {
            try {
                DB::transaction($operation);
                $this->fail('Expected a real PostgreSQL constraint failure.');
            } catch (QueryException $error) {
                $this->assertSame($state, $error->errorInfo[0]);
            }
        }
    }

    public function test_seed_failure_rolls_back_earlier_relational_changes(): void
    {
        Product::findOrFail('product-001')->delete();
        Product::create([
            'id' => 'qa-manual-product', 'workspace_id' => 'ws-1', 'sku' => 'APX-0001',
            'slug' => 'qa-manual-product', 'name' => 'Manual conflict', 'category' => 'office',
            'price' => '1.00', 'stock' => 1, 'active' => true, 'tags' => [], 'attributes' => [],
        ]);
        Workspace::findOrFail('ws-1')->update(['name' => 'Before attempted seed']);
        try {
            $this->seed(RelationalPlaygroundSeeder::class);
            $this->fail('Expected the existing manual SKU to cause a seed conflict.');
        } catch (QueryException $error) {
            $this->assertSame('23505', $error->errorInfo[0]);
        }
        $this->assertSame('Before attempted seed', Workspace::findOrFail('ws-1')->name);
        $this->assertNull(Product::find('product-001'));
        $this->assertNotNull(Product::find('qa-manual-product'));
    }

    public function test_opt_in_pagination_profile_is_repeatable_and_separate(): void
    {
        $this->seed(ScalePlaygroundSeeder::class);
        $this->seed(ScalePlaygroundSeeder::class);
        $this->assertSame(1000, Article::where('workspace_id', 'scale-pagination')->count());
        $this->assertSame(63, Article::whereIn('id', array_column(FixtureData::records('records/articles.json'), 'id'))->count());
        $this->assertSame(0, Workspace::findOrFail('ws-3')->contacts()->count());
    }

    public function test_file_fixture_bytes_match_manifest_and_changed_bytes_are_not_overwritten(): void
    {
        Storage::fake('local');
        $this->seed(FileFixtureSeeder::class);
        $this->seed(FileFixtureSeeder::class);
        foreach (FixtureData::read('files/file-fixtures.json')->files as $fixture) {
            $bytes = Storage::disk('local')->get($fixture->path);
            $this->assertSame($fixture->size_bytes, strlen($bytes));
            $this->assertSame($fixture->sha256, hash('sha256', $bytes));
        }
        $fixture = FixtureData::read('files/file-fixtures.json')->files[0];
        Storage::disk('local')->put($fixture->path, 'caller changed this');
        $this->expectException(RuntimeException::class);
        $this->seed(FileFixtureSeeder::class);
    }

    public function test_guard_refuses_production_and_mistaken_environment_selection(): void
    {
        foreach ([['production', 'apixa_laravel_test'], ['testing', 'apixa_laravel_dev'], ['local', 'unrelated_database']] as [$env, $db]) {
            config(['app.env' => $env, 'database.connections.pgsql.database' => $db]);
            try {
                FixtureData::guard('pgsql');
                $this->fail('Unsafe seeding should be refused before a write.');
            } catch (RuntimeException $error) {
                $this->assertStringContainsString('only run', $error->getMessage());
            }
        }
    }
}
