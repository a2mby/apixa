<?php

namespace Tests\Feature\Products;

use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Genuinely concurrent: every worker is a separate PHP process with its own PostgreSQL connection, released by a
 * shared start time. Data is committed (no wrapping transaction) so the workers can see it, and removed afterwards.
 * Requests go through the real HTTP kernel in each process, not over a TCP socket.
 */
class ProductConcurrencyTest extends TestCase
{
    private const PREFIX = 'conc-';

    protected function setUp(): void
    {
        parent::setUp();
        Product::where('id', 'like', self::PREFIX.'%')->delete();
    }

    protected function tearDown(): void
    {
        Product::where('id', 'like', self::PREFIX.'%')->delete();
        parent::tearDown();
    }

    private function product(string $id, int $stock): Product
    {
        $p = new Product(['sku' => strtoupper($id), 'slug' => $id, 'name' => $id, 'category' => 'concurrency', 'price' => '5.00', 'stock' => $stock, 'active' => true, 'tags' => [], 'attributes' => (object) []]);
        $p->id = $id;
        $p->workspace_id = 'ws-1';
        $p->save();

        return $p;
    }

    /**
     * @param  list<list<array<string, mixed>>>  $workers  Requests per worker process.
     * @return list<list<array{status: int, body: array}>>
     */
    private function race(array $workers): array
    {
        $start = microtime(true) + 3.0;
        $procs = [];
        foreach ($workers as $i => $requests) {
            $cmd = [PHP_BINARY, base_path('tests/Support/http_worker.php'), json_encode(['start' => $start, 'requests' => $requests])];
            $procs[$i] = proc_open($cmd, [1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes, base_path(), ['APP_ENV' => 'testing', 'DB_DATABASE' => 'apixa_laravel_test', 'PATH' => getenv('PATH')]) ?: $this->fail('could not start worker');
            $procs[$i] = [$procs[$i], $pipes];
        }
        $out = [];
        foreach ($procs as $i => [$proc, $pipes]) {
            $stdout = stream_get_contents($pipes[1]);
            $stderr = stream_get_contents($pipes[2]);
            proc_close($proc);
            $decoded = json_decode($stdout, true);
            $this->assertIsArray($decoded, "worker $i failed: $stderr $stdout");
            $out[$i] = $decoded;
        }

        return $out;
    }

    private function adjust(string $id, int $delta): array
    {
        return ['method' => 'POST', 'uri' => "/api/workspaces/ws-1/products/$id/stock/adjustments", 'body' => ['delta' => $delta]];
    }

    public function test_simultaneous_decrements_never_oversell(): void
    {
        $this->product(self::PREFIX.'oversell', 50);
        $results = $this->race(array_fill(0, 8, array_fill(0, 10, $this->adjust(self::PREFIX.'oversell', -1)))); // 80 attempts for 50 units

        $flat = array_merge(...$results);
        $ok = count(array_filter($flat, fn ($r) => $r['status'] === 200));
        $conflicts = array_filter($flat, fn ($r) => $r['status'] === 409);
        $this->assertSame(50, $ok, 'exactly as many successes as units');
        $this->assertCount(30, $conflicts);
        $this->assertSame('insufficient_stock', reset($conflicts)['body']['code']);
        $this->assertSame([], array_filter($flat, fn ($r) => ! in_array($r['status'], [200, 409], true)), 'no deadlocks or 500s');
        $this->assertSame(0, Product::find(self::PREFIX.'oversell')->stock);
    }

    public function test_simultaneous_increments_lose_no_updates(): void
    {
        $this->product(self::PREFIX.'lost', 0);
        $results = $this->race(array_fill(0, 6, array_fill(0, 10, $this->adjust(self::PREFIX.'lost', 1))));

        $this->assertSame(60, count(array_filter(array_merge(...$results), fn ($r) => $r['status'] === 200)));
        $this->assertSame(60, Product::find(self::PREFIX.'lost')->stock);
    }

    public function test_only_one_of_many_writers_holding_the_same_etag_wins(): void
    {
        $product = $this->product(self::PREFIX.'etag', 5);
        $etag = $this->getJson("/api/workspaces/ws-1/products/{$product->id}")->headers->get('ETag');
        $workers = array_map(fn ($i) => [['method' => 'PATCH', 'uri' => "/api/workspaces/ws-1/products/{$product->id}", 'body' => ['name' => "writer $i"], 'headers' => ['If-Match' => $etag]]], range(1, 6));

        $statuses = array_map(fn ($w) => $w[0]['status'], $this->race($workers));
        sort($statuses);
        $this->assertSame([200, 409, 409, 409, 409, 409], $statuses, 'one winner; the rest get version_conflict instead of silently overwriting');
    }

    public function test_bulk_adjustments_in_opposite_orders_do_not_deadlock(): void
    {
        $this->product(self::PREFIX.'a', 100);
        $this->product(self::PREFIX.'b', 100);
        $bulk = fn (array $ids) => ['method' => 'POST', 'uri' => '/api/workspaces/ws-1/products/bulk/stock-adjustments', 'body' => ['items' => array_map(fn ($id) => ['id' => $id, 'delta' => -1], $ids)]];
        $a = array_fill(0, 10, $bulk([self::PREFIX.'a', self::PREFIX.'b']));
        $b = array_fill(0, 10, $bulk([self::PREFIX.'b', self::PREFIX.'a']));

        $flat = array_merge(...$this->race([$a, $b, $a, $b]));
        $this->assertSame(40, count(array_filter($flat, fn ($r) => $r['status'] === 200)), 'rows are locked in id order, so opposite orders cannot deadlock');
        $this->assertSame([60, 60], [Product::find(self::PREFIX.'a')->stock, Product::find(self::PREFIX.'b')->stock]);
    }

    public function test_concurrent_creates_with_the_same_sku_produce_one_row(): void
    {
        $body = fn ($i) => ['method' => 'POST', 'uri' => '/api/workspaces/ws-1/products', 'body' => ['name' => "race $i", 'sku' => 'CONC-RACE', 'slug' => "conc-race-$i", 'category' => 'concurrency', 'price' => '1.00', 'stock' => 1, 'active' => true]];
        $statuses = array_map(fn ($w) => $w[0]['status'], $this->race(array_map(fn ($i) => [$body($i)], range(1, 6))));
        try {
            $this->assertSame(1, count(array_filter($statuses, fn ($s) => $s === 201)));
            $this->assertSame([422], array_values(array_unique(array_diff($statuses, [201]))), 'losers get the normal duplicate-SKU validation error, not a 500');
            $this->assertSame(1, Product::where('sku', 'CONC-RACE')->count());
        } finally {
            Product::where('sku', 'CONC-RACE')->delete();
        }
    }

    public function test_export_outside_a_test_transaction_runs_in_a_repeatable_read_snapshot(): void
    {
        foreach (range(1, 12) as $i) {
            $this->product(self::PREFIX."snap-$i", $i);
        }
        config(['products.export.chunk_size' => 5]);
        $queries = [];
        DB::listen(function ($q) use (&$queries) {
            $queries[] = $q->sql;
        });
        $this->assertSame(0, DB::transactionLevel(), 'precondition: no wrapping transaction');

        $lines = explode("\n", rtrim($this->get('/api/workspaces/ws-1/products/exports?format=ndjson&q=conc-snap', ['Accept' => '*/*'])->streamedContent(), "\n"));
        $this->assertCount(12, $lines);
        $this->assertCount(12, array_unique(array_column(array_map(fn ($l) => json_decode($l, true), $lines), 'id')));
        $this->assertContains('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ', $queries);
    }
}
