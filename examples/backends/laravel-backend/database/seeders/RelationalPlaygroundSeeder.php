<?php

namespace Database\Seeders;

use App\Models\Article;
use App\Models\Comment;
use App\Models\Contact;
use App\Models\Counter;
use App\Models\Document;
use App\Models\DocumentLink;
use App\Models\NumericRecord;
use App\Models\Product;
use App\Models\Profile;
use App\Models\Task;
use App\Models\UuidRecord;
use App\Models\Workspace;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class RelationalPlaygroundSeeder extends Seeder
{
    public const DATASETS = [
        'workspaces' => Workspace::class,
        'contacts' => Contact::class,
        'numeric-records' => NumericRecord::class,
        'uuid-records' => UuidRecord::class,
        'articles' => Article::class,
        'comments' => Comment::class,
        'products' => Product::class,
        'profiles' => Profile::class,
        'documents' => Document::class,
        'document-links' => DocumentLink::class,
        'tasks' => Task::class,
        'counters' => Counter::class,
    ];

    public function run(): void
    {
        FixtureData::guard('pgsql');
        DB::connection('pgsql')->transaction(function () {
            foreach (self::DATASETS as $dataset => $model) {
                foreach (FixtureData::records("records/$dataset.json") as $record) {
                    $model::updateOrCreate(['id' => $record['id']], $record);
                }
            }
            // Explicit numeric fixtures include 0. Advance, never rewind, the identity sequence.
            DB::connection('pgsql')->statement("SELECT setval(pg_get_serial_sequence('numeric_records', 'id'), GREATEST((SELECT last_value FROM numeric_records_id_seq), (SELECT COALESCE(MAX(id), 1) FROM numeric_records)), true)");
        });
    }
}
