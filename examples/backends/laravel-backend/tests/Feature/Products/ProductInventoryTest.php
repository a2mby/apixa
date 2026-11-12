<?php

namespace Tests\Feature\Products;

use App\Models\Product;

class ProductInventoryTest extends ProductApiTestCase
{
    public function test_set_stock_is_exact_and_rejects_negatives_and_non_integers(): void
    {
        $p = $this->make(['stock' => 10]);
        $this->patchJson($this->url("$p->id/stock"), ['stock' => 0])->assertOk()->assertJsonPath('data.stock', 0);
        $this->patchJson($this->url("$p->id/stock"), ['stock' => 99])->assertOk()->assertJsonPath('data.stock', 99);
        foreach ([-1, 1.5, 'abc', null, 2147483648] as $bad) {
            $this->patchJson($this->url("$p->id/stock"), ['stock' => $bad])->assertUnprocessable()->assertJsonValidationErrors('stock');
        }
        $this->assertSame(99, $p->fresh()->stock);
    }

    public function test_adjustments_apply_deltas_and_never_go_below_zero(): void
    {
        $p = $this->make(['stock' => 5]);
        $this->postJson($this->url("$p->id/stock/adjustments"), ['delta' => 3])->assertOk()->assertJsonPath('data.stock', 8);
        $this->postJson($this->url("$p->id/stock/adjustments"), ['delta' => -8])->assertOk()->assertJsonPath('data.stock', 0);
        $this->postJson($this->url("$p->id/stock/adjustments"), ['delta' => -1])->assertStatus(409)
            ->assertJson(['code' => 'insufficient_stock', 'available' => 0, 'requested_delta' => -1])->assertJsonStructure(['message', 'code']);
        $this->assertSame(0, $p->fresh()->stock, 'the rejected adjustment changed nothing');
    }

    public function test_adjustment_validation_and_overflow(): void
    {
        $p = $this->make(['stock' => 2147483647]);
        $this->postJson($this->url("$p->id/stock/adjustments"), ['delta' => 1])->assertStatus(409)->assertJson(['code' => 'stock_limit_exceeded']);
        foreach ([0, 1.5, 'x', null, 2147483648] as $bad) {
            $this->postJson($this->url("$p->id/stock/adjustments"), ['delta' => $bad])->assertUnprocessable()->assertJsonValidationErrors('delta');
        }
        $this->postJson($this->url("$p->id/stock/adjustments"), [])->assertUnprocessable();
        $this->assertSame(2147483647, $p->fresh()->stock);
    }

    public function test_adjustment_updates_updated_at_and_the_etag(): void
    {
        $p = $this->make(['stock' => 5]);
        $etag = $this->getJson($this->url($p->id))->headers->get('ETag');
        $r = $this->postJson($this->url("$p->id/stock/adjustments"), ['delta' => 1])->assertOk();
        $this->assertNotSame($etag, $r->headers->get('ETag'));
    }

    public function test_price_is_exact_decimal_and_rejects_negative_or_overprecise_values(): void
    {
        $p = $this->make(['price' => '1.00']);
        $this->patchJson($this->url("$p->id/price"), ['price' => '0.10'])->assertOk()->assertJsonPath('data.price', '0.10');
        $this->patchJson($this->url("$p->id/price"), ['price' => 0.3])->assertOk()->assertJsonPath('data.price', '0.30');
        $this->patchJson($this->url("$p->id/price"), ['price' => 7])->assertOk()->assertJsonPath('data.price', '7.00');
        $this->patchJson($this->url("$p->id/price"), ['price' => '9999999999.99'])->assertOk()->assertJsonPath('data.price', '9999999999.99');
        foreach (['-0.01', '0.001', 0.1 + 0.2, 'abc', null, '', '10000000000.00'] as $bad) {
            $this->patchJson($this->url("$p->id/price"), ['price' => $bad])->assertUnprocessable()->assertJsonValidationErrors('price');
        }
        $this->assertSame('9999999999.99', (string) $p->fresh()->price);
    }

    public function test_activation_is_explicit_and_idempotent(): void
    {
        $p = $this->make(['active' => true]);
        $first = $this->patchJson($this->url("$p->id/activation"), ['active' => false])->assertOk()->assertJsonPath('data.active', false);
        $second = $this->patchJson($this->url("$p->id/activation"), ['active' => false])->assertOk()->assertJsonPath('data.active', false);
        $this->assertSame($first->headers->get('ETag'), $second->headers->get('ETag'), 'repeating the same state changes nothing, not even updated_at');
        $this->patchJson($this->url("$p->id/activation"), ['active' => true])->assertOk()->assertJsonPath('data.active', true);
        $this->patchJson($this->url("$p->id/activation"), [])->assertUnprocessable();
        $this->patchJson($this->url("$p->id/activation"), ['active' => 'maybe'])->assertUnprocessable();
    }

    public function test_if_match_protects_absolute_writes_with_409_version_conflict(): void
    {
        $p = $this->make();
        $stale = $this->getJson($this->url($p->id))->headers->get('ETag');
        $this->patchJson($this->url($p->id), ['name' => 'Someone else'])->assertOk();

        foreach ([
            fn () => $this->patchJson($this->url($p->id), ['name' => 'Mine'], ['If-Match' => $stale]),
            fn () => $this->putJson($this->url($p->id), $this->valid(['slug' => 'mine']), ['If-Match' => $stale]),
            fn () => $this->deleteJson($this->url($p->id), [], ['If-Match' => $stale]),
            fn () => $this->patchJson($this->url("$p->id/stock"), ['stock' => 1], ['If-Match' => $stale]),
            fn () => $this->patchJson($this->url("$p->id/price"), ['price' => 1], ['If-Match' => $stale]),
            fn () => $this->patchJson($this->url("$p->id/activation"), ['active' => false], ['If-Match' => $stale]),
        ] as $attempt) {
            $attempt()->assertStatus(409)->assertJson(['code' => 'version_conflict'])->assertHeader('ETag');
        }
        $this->assertSame('Someone else', $p->fresh()->name);

        $fresh = $this->getJson($this->url($p->id))->headers->get('ETag');
        $this->patchJson($this->url($p->id), ['name' => 'Mine'], ['If-Match' => $fresh])->assertOk();
        $this->patchJson($this->url($p->id), ['name' => 'Anything'], ['If-Match' => '*'])->assertOk();
        $this->patchJson($this->url($p->id), ['name' => 'No header means last write wins'])->assertOk();
        $this->deleteJson($this->url($p->id), [], ['If-Match' => $this->getJson($this->url($p->id))->headers->get('ETag')])->assertNoContent();
    }

    public function test_duplicate_copies_editable_fields_with_new_identity(): void
    {
        $source = Product::findOrFail('product-002');
        $r = $this->postJson($this->url('product-002/duplicate'))->assertCreated();
        $copy = $r->json('data');
        $r->assertHeader('Location', url("/api/workspaces/ws-1/products/{$copy['id']}"));
        $this->assertNotSame($source->id, $copy['id']);
        $this->assertSame('APX-0002-COPY', $copy['sku']);
        $this->assertSame('Notebook 2 (copy)', $copy['name']);
        $this->assertSame('ws-1', $copy['workspace_id']);
        $this->assertSame(0, $copy['stock'], 'stock is not copied unless asked');
        $this->assertSame([$source->category, (string) $source->price, $source->tags], [$copy['category'], $copy['price'], $copy['tags']]);
        $this->assertEquals($source->attributes, json_decode(json_encode($copy['attributes']), true));

        $second = $this->postJson($this->url('product-002/duplicate'), ['copy_stock' => true, 'active' => false])->assertCreated()->json('data');
        $this->assertSame('APX-0002-COPY-2', $second['sku'], 'generated SKUs are made unique');
        $this->assertSame([$source->stock, false], [$second['stock'], $second['active']]);
        $this->assertNotSame($copy['slug'], $second['slug']);

        $this->postJson($this->url('product-002/duplicate'), ['sku' => 'APX-0004'])->assertUnprocessable()->assertJsonValidationErrors('sku');
        $this->postJson($this->url('product-002/duplicate'), ['sku' => 'CUSTOM-1', 'name' => 'Custom', 'slug' => 'custom-1'])->assertCreated()->assertJsonPath('data.sku', 'CUSTOM-1');
        $this->postJson($this->url('product-001/duplicate'))->assertNotFound();
        $this->assertSame(120 + 3, Product::count());
    }

    public function test_writes_to_one_product_do_not_touch_others(): void
    {
        $before = Product::findOrFail('product-004')->toArray();
        $p = $this->make();
        $this->patchJson($this->url("$p->id/stock"), ['stock' => 1]);
        $this->postJson($this->url("$p->id/stock/adjustments"), ['delta' => 1]);
        $this->assertSame($before, Product::findOrFail('product-004')->toArray());
    }
}
