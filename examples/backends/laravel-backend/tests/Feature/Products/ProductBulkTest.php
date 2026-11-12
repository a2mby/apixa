<?php

namespace Tests\Feature\Products;

use App\Models\Product;
use Illuminate\Support\Facades\DB;

class ProductBulkTest extends ProductApiTestCase
{
    private const BULK = 'bulk';

    private function bulk(string $path, array $body)
    {
        return $this->postJson($this->url("bulk/$path"), $body);
    }

    /** @return list<string> */
    private function three(array $overrides = []): array
    {
        return array_map(fn () => $this->make($overrides)->id, range(1, 3));
    }

    public function test_bulk_activation_atomic_success_reports_every_item(): void
    {
        $ids = $this->three(['active' => true]);
        $r = $this->bulk('activation', ['ids' => $ids, 'active' => false])->assertOk();
        $this->assertSame(['atomic', true, 3, 3, 0], [$r->json('data.transaction'), $r->json('data.committed'), $r->json('data.requested'), $r->json('data.succeeded'), $r->json('data.failed')]);
        $this->assertSame($ids, array_column($r->json('data.results'), 'id'), 'results keep request order');
        $this->assertSame(0, Product::whereIn('id', $ids)->where('active', true)->count());
        $this->assertFalse($r->json('data.results.0.product.active'));
    }

    public function test_bulk_deletions_and_out_of_workspace_or_unknown_ids_roll_back_in_atomic_mode(): void
    {
        $ids = $this->three();
        $r = $this->bulk('deletions', ['ids' => [...$ids, 'product-001', 'ghost']])->assertStatus(409);
        $r->assertJson(['code' => 'bulk_atomic_failed', 'data' => ['committed' => false, 'succeeded' => 0, 'rolled_back' => 3, 'failed' => 2]]);
        $statuses = array_column($r->json('data.results'), 'status', 'id');
        $this->assertSame(['rolled_back', 'rolled_back', 'rolled_back', 'error', 'error'], array_values($statuses));
        $this->assertSame('not_found', $r->json('data.results.3.error.code'));
        $this->assertSame(3, Product::whereIn('id', $ids)->count(), 'nothing was deleted');
        $this->assertNotNull(Product::find('product-001'), 'the other workspace was not touched');
    }

    public function test_bulk_partial_mode_applies_what_it_can_and_reports_the_rest(): void
    {
        $ids = $this->three();
        $r = $this->bulk('deletions', ['transaction' => 'partial', 'ids' => [$ids[0], 'ghost', $ids[1], 'product-001']])->assertOk();
        $this->assertSame([2, 2, true], [$r->json('data.succeeded'), $r->json('data.failed'), $r->json('data.committed')]);
        $this->assertTrue($r->json('data.results.0.deleted'));
        $this->assertSame(['ok', 'error', 'ok', 'error'], array_column($r->json('data.results'), 'status'));
        $this->assertSame([null, null], [Product::find($ids[0]), Product::find($ids[1])]);
        $this->assertNotNull(Product::find($ids[2]));
        $this->assertNotNull(Product::find('product-001'));
    }

    public function test_request_level_validation_rejects_the_whole_request_before_anything_runs(): void
    {
        $ids = $this->three(['stock' => 5]);
        $this->bulk('deletions', ['ids' => []])->assertUnprocessable()->assertJsonValidationErrors('ids');
        $this->bulk('deletions', [])->assertUnprocessable();
        $this->bulk('deletions', ['ids' => [$ids[0], $ids[0]]])->assertUnprocessable()->assertJsonValidationErrors('ids.0');
        $this->bulk('deletions', ['ids' => [1, 2]])->assertUnprocessable();
        $this->bulk('deletions', ['ids' => $ids, 'transaction' => 'sometimes'])->assertUnprocessable()->assertJsonValidationErrors('transaction');
        $this->bulk('deletions', ['ids' => array_map(fn ($i) => "x$i", range(1, 101))])->assertUnprocessable()->assertJsonValidationErrors('ids');
        $this->bulk('activation', ['ids' => $ids])->assertUnprocessable()->assertJsonValidationErrors('active');
        $this->assertSame(3, Product::whereIn('id', $ids)->count());
    }

    public function test_batch_size_limit_is_configurable(): void
    {
        config(['products.bulk_max_items' => 2]);
        $this->bulk('deletions', ['ids' => ['a', 'b', 'c']])->assertUnprocessable();
        $this->bulk('deletions', ['transaction' => 'partial', 'ids' => ['a', 'b']])->assertOk();
    }

    public function test_bulk_price_adjustments_use_exact_decimals_and_reject_negative_results(): void
    {
        $a = $this->make(['price' => '10.00'])->id;
        $b = $this->make(['price' => '0.10'])->id;
        $r = $this->bulk('price-adjustments', ['ids' => [$a, $b], 'operation' => 'percent', 'value' => '10'])->assertOk();
        $this->assertSame(['11.00', '0.11'], array_column(array_column($r->json('data.results'), 'product'), 'price'));
        $this->bulk('price-adjustments', ['ids' => [$a, $b], 'operation' => 'add', 'value' => '0.20'])->assertOk();
        $this->assertSame(['11.20', '0.31'], [(string) Product::find($a)->price, (string) Product::find($b)->price]);
        $this->bulk('price-adjustments', ['ids' => [$a], 'operation' => 'set', 'value' => '3'])->assertOk();
        $this->assertSame('3.00', (string) Product::find($a)->price);

        $fail = $this->bulk('price-adjustments', ['ids' => [$a, $b], 'operation' => 'add', 'value' => '-1.00'])->assertStatus(409);
        $this->assertSame('invalid_price', $fail->json('data.results.1.error.code'));
        $this->assertSame(['3.00', '0.31'], [(string) Product::find($a)->price, (string) Product::find($b)->price], 'atomic: nothing changed');

        $part = $this->bulk('price-adjustments', ['transaction' => 'partial', 'ids' => [$a, $b], 'operation' => 'add', 'value' => '-1.00'])->assertOk();
        $this->assertSame(['2.00', '0.31'], [(string) Product::find($a)->price, (string) Product::find($b)->price], 'partial: only the valid item changed');
        $this->assertSame([1, 1], [$part->json('data.succeeded'), $part->json('data.failed')]);

        $this->bulk('price-adjustments', ['ids' => [$a], 'operation' => 'set', 'value' => '-1'])->assertUnprocessable();
        $this->bulk('price-adjustments', ['ids' => [$a], 'operation' => 'multiply', 'value' => '2'])->assertUnprocessable();
        $this->bulk('price-adjustments', ['ids' => [$a], 'operation' => 'add', 'value' => '0.001'])->assertUnprocessable();
    }

    public function test_bulk_stock_adjustments_prevent_negative_stock_per_item(): void
    {
        [$a, $b] = [$this->make(['stock' => 5])->id, $this->make(['stock' => 1])->id];
        $items = [['id' => $a, 'delta' => -5], ['id' => $b, 'delta' => -2]];

        $atomic = $this->bulk('stock-adjustments', ['items' => $items])->assertStatus(409);
        $this->assertSame('insufficient_stock', $atomic->json('data.results.1.error.code'));
        $this->assertSame([5, 1], [Product::find($a)->stock, Product::find($b)->stock], 'the valid item was rolled back too');

        $this->bulk('stock-adjustments', ['transaction' => 'partial', 'items' => $items])->assertOk()->assertJsonPath('data.succeeded', 1);
        $this->assertSame([0, 1], [Product::find($a)->stock, Product::find($b)->stock]);

        $this->bulk('stock-adjustments', ['items' => [['id' => $a, 'delta' => 0]]])->assertUnprocessable();
        $this->bulk('stock-adjustments', ['items' => [['id' => $a, 'delta' => 1], ['id' => $a, 'delta' => 2]]])->assertUnprocessable();
    }

    public function test_bulk_updates_patch_each_item_and_report_duplicate_sku_per_item(): void
    {
        [$a, $b] = $this->three()[0] ? array_slice($this->three(), 0, 2) : [];
        $r = $this->bulk('updates', ['items' => [['id' => $a, 'name' => 'Renamed', 'attributes' => ['x' => new \stdClass]], ['id' => $b, 'stock' => 0, 'tags' => []]]])->assertOk();
        $this->assertSame('Renamed', Product::find($a)->name);
        $this->assertSame(0, Product::find($b)->stock);
        $this->assertStringContainsString('"attributes":{"x":{}}', $r->getContent());

        $skuOfB = Product::find($b)->sku;
        $conflict = $this->bulk('updates', ['items' => [['id' => $a, 'name' => 'Ok'], ['id' => $a === $b ? 'x' : $this->make()->id, 'sku' => $skuOfB]]])->assertStatus(409);
        $this->assertSame('duplicate_value', $conflict->json('data.results.1.error.code'));
        $this->assertSame('Renamed', Product::find($a)->name, 'atomic rollback also covers the item that was valid');

        $partial = $this->bulk('updates', ['transaction' => 'partial', 'items' => [['id' => $a, 'name' => 'Ok'], ['id' => $b, 'sku' => 'APX-0002']]])->assertOk();
        $this->assertSame([1, 1], [$partial->json('data.succeeded'), $partial->json('data.failed')]);
        $this->assertSame('Ok', Product::find($a)->name, 'a failed item in partial mode does not poison the transaction');
    }

    public function test_bulk_updates_validate_item_fields_and_forbid_workspace_changes(): void
    {
        $a = $this->make()->id;
        $this->bulk('updates', ['items' => [['id' => $a, 'price' => '-1']]])->assertUnprocessable()->assertJsonValidationErrors('items.0.price');
        $this->bulk('updates', ['items' => [['id' => $a, 'workspace_id' => 'ws-2']]])->assertUnprocessable()->assertJsonValidationErrors('items.0.workspace_id');
        $this->bulk('updates', ['items' => [['name' => 'no id']]])->assertUnprocessable()->assertJsonValidationErrors('items.0.id');
        $this->bulk('updates', ['items' => [['id' => $a, 'sku' => 'S-1'], ['id' => $this->make()->id, 'sku' => 'S-1']]])->assertUnprocessable();
        $this->assertSame('ws-1', Product::find($a)->workspace_id);
    }

    public function test_bulk_calls_use_a_bounded_number_of_reads(): void
    {
        $ids = array_map(fn () => $this->make()->id, range(1, 20));
        $selects = 0;
        DB::listen(function ($q) use (&$selects) {
            if (stripos($q->sql, 'select') === 0 || stripos($q->sql, 'select') !== false && stripos($q->sql, 'update') === false && stripos($q->sql, 'delete') === false) {
                $selects++;
            }
        });
        $this->bulk('activation', ['ids' => $ids, 'active' => false])->assertOk();
        $this->assertLessThanOrEqual(25, $selects); // one locking read + one refresh per item; never a read per id per step
    }
}
