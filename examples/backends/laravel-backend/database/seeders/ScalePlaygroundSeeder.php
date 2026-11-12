<?php

namespace Database\Seeders;

use App\Models\Article;
use App\Models\Contact;
use App\Models\Workspace;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/** Opt-in 1,000-row pagination profile; does not change the baseline fixture universe. */
class ScalePlaygroundSeeder extends Seeder
{
    protected int $records = 1000;

    protected string $profile = 'pagination';

    public function run(): void
    {
        FixtureData::guard('pgsql');
        DB::connection('pgsql')->transaction(function () {
            $prefix = 'scale-'.$this->profile;
            $workspace = Workspace::updateOrCreate(['id' => $prefix], ['name' => 'Generated '.$this->profile, 'slug' => $prefix]);
            Contact::updateOrCreate(['id' => $prefix], [
                'workspace_id' => $workspace->id, 'name' => 'Generated owner', 'slug' => $prefix,
                'email' => $prefix.'@example.test', 'active' => true, 'score' => 0, 'documents' => [],
            ]);
            for ($start = 1; $start <= $this->records; $start += 500) {
                $rows = [];
                for ($i = $start; $i <= min($start + 499, $this->records); $i++) {
                    $id = $prefix.'-'.str_pad((string) $i, 6, '0', STR_PAD_LEFT);
                    $rows[] = [
                        'id' => $id, 'workspace_id' => $workspace->id, 'contact_id' => $prefix,
                        'slug' => $id, 'title' => "Generated article $i", 'status' => $i % 2 ? 'draft' : 'published',
                        'body' => "Predictable generated body $i", 'published_at' => null, 'rank' => intdiv($i, 4),
                        'metadata' => json_encode(['generated' => true, 'profile' => $this->profile, 'index' => $i], JSON_THROW_ON_ERROR),
                        'created_at' => '2026-01-01 12:00:00+00', 'updated_at' => '2026-01-01 12:00:00+00',
                    ];
                }
                Article::upsert($rows, ['id'], ['workspace_id', 'contact_id', 'slug', 'title', 'status', 'body', 'published_at', 'rank', 'metadata', 'updated_at']);
            }
        });
    }
}
