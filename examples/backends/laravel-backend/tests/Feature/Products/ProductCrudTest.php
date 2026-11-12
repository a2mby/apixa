<?php

namespace Tests\Feature\Products;

use App\Models\Product;
use Illuminate\Support\Facades\Route;

class ProductCrudTest extends ProductApiTestCase
{
    public function test_create_returns_201_location_etag_and_exact_contract(): void
    {
        $payload = $this->valid(['name' => 'شاشة جديدة', 'price' => '19.9', 'stock' => 0, 'active' => false, 'tags' => [], 'attributes' => []]);
        $response = $this->postJson($this->url(), $payload)->assertCreated();

        $id = $response->json('data.id');
        $response->assertHeader('Location', url("/api/workspaces/ws-1/products/$id"))->assertHeader('ETag');
        $response->assertJsonStructure(['data' => ['id', 'workspace_id', 'sku', 'slug', 'name', 'category', 'price', 'stock', 'active', 'tags', 'attributes', 'created_at', 'updated_at']]);
        $this->assertSame('19.90', $response->json('data.price'), 'price is a two-decimal string');
        $this->assertSame(0, $response->json('data.stock'));
        $this->assertFalse($response->json('data.active'));
        $this->assertSame([], $response->json('data.tags'));
        $this->assertStringContainsString('"attributes":{}', $response->getContent(), 'empty attributes serialise as {} not []');
        $this->assertStringContainsString('"tags":[]', $response->getContent());
        $this->assertSame('ws-1', $response->json('data.workspace_id'));
        $this->assertNotEmpty($response->json('data.slug'));
    }

    public function test_nested_empty_objects_and_lists_survive_a_round_trip(): void
    {
        $body = '{"name":"Nested","sku":"NEST-1","category":"office","price":"1.00","stock":1,"active":true,"attributes":{"a":{},"b":[],"c":{"d":{}},"e":null,"f":0,"g":false}}';
        $id = $this->call('POST', $this->url(), [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], $body)->assertCreated()->json('data.id');
        $this->assertStringContainsString('"attributes":{"a":{},"b":[],"c":{"d":{}},"e":null,"f":0,"g":false}', $this->getJson($this->url($id))->getContent());
    }

    public function test_show_returns_the_product_and_an_etag_that_changes_with_the_content(): void
    {
        $show = $this->getJson($this->url('product-002'))->assertOk();
        $this->assertSame('product-002', $show->json('data.id'));
        $this->assertSame('2.74', $show->json('data.price'));
        $etag = $show->headers->get('ETag');
        $this->assertSame($etag, $this->getJson($this->url('product-002'))->headers->get('ETag'), 'stable while unchanged');
        $this->patchJson($this->url('product-002'), ['name' => 'Changed'])->assertOk();
        $this->assertNotSame($etag, $this->getJson($this->url('product-002'))->headers->get('ETag'));
    }

    public function test_another_workspaces_product_and_unknown_ids_are_404(): void
    {
        $this->getJson($this->url('product-001'))->assertNotFound()->assertJson(['code' => 'not_found']); // product-001 is ws-2
        $this->getJson($this->url('product-001', 'ws-2'))->assertOk();
        $this->getJson($this->url('does-not-exist'))->assertNotFound();
        $this->getJson('/api/workspaces/nope/products')->assertNotFound();
        $this->putJson($this->url('product-001'), $this->valid(['slug' => 'x-y']))->assertNotFound();
        $this->patchJson($this->url('product-001'), ['name' => 'x'])->assertNotFound();
        $this->deleteJson($this->url('product-001'))->assertNotFound();
        $this->patchJson($this->url('product-001/stock'), ['stock' => 1])->assertNotFound();
        $this->assertSame('Camera 1', Product::find('product-001')->name, 'the other workspace was not touched');
    }

    public function test_put_replaces_every_editable_field_and_requires_the_required_ones(): void
    {
        $id = 'product-002';
        $this->putJson($this->url($id), ['name' => 'Only name'])->assertUnprocessable()->assertJsonValidationErrors(['sku', 'slug', 'category', 'price', 'stock', 'active']);

        $this->putJson($this->url($id), ['name' => 'Replaced', 'slug' => 'replaced', 'sku' => 'APX-0002', 'category' => 'office', 'price' => 3, 'stock' => 7, 'active' => false])
            ->assertOk()
            ->assertJson(['data' => ['name' => 'Replaced', 'price' => '3.00', 'stock' => 7, 'active' => false, 'tags' => []]]);
        $this->assertStringContainsString('"attributes":{}', $this->getJson($this->url($id))->getContent(), 'omitted attributes are reset by PUT');
    }

    public function test_patch_changes_only_the_fields_sent(): void
    {
        $before = $this->getJson($this->url('product-002'))->json('data');
        $after = $this->patchJson($this->url('product-002'), ['stock' => 0, 'active' => false])->assertOk()->json('data');
        $this->assertSame(0, $after['stock']);
        $this->assertFalse($after['active']);
        foreach (['name', 'sku', 'slug', 'category', 'price', 'tags', 'attributes'] as $field) {
            $this->assertEquals($before[$field], $after[$field], $field);
        }
        $this->patchJson($this->url('product-002'), [])->assertOk(); // an empty patch is a no-op
    }

    public function test_patch_replaces_attributes_wholesale_and_null_resets_them(): void
    {
        $this->patchJson($this->url('product-002'), ['attributes' => ['color' => 'green']])->assertOk()->assertJsonPath('data.attributes', ['color' => 'green']);
        $this->assertStringContainsString('"attributes":{}', $this->patchJson($this->url('product-002'), ['attributes' => null])->getContent());
    }

    public function test_workspace_and_id_cannot_be_changed(): void
    {
        $this->patchJson($this->url('product-002'), ['workspace_id' => 'ws-2'])->assertUnprocessable()->assertJsonValidationErrors('workspace_id');
        $this->patchJson($this->url('product-002'), ['id' => 'other'])->assertUnprocessable()->assertJsonValidationErrors('id');
        $this->postJson($this->url(), $this->valid(['workspace_id' => 'ws-2']))->assertUnprocessable();
    }

    public function test_delete_returns_204_and_a_second_delete_is_404(): void
    {
        $product = $this->make();
        $this->deleteJson($this->url($product->id))->assertNoContent();
        $this->assertNull(Product::find($product->id));
        $this->deleteJson($this->url($product->id))->assertNotFound();
        $this->getJson($this->url($product->id))->assertNotFound();
    }

    public function test_validation_rejects_bad_prices_stocks_and_duplicates_with_a_consistent_error_body(): void
    {
        foreach (['-1', '1.234', 'abc', '', null, '1e3', '99999999999.00', true] as $price) {
            $this->postJson($this->url(), $this->valid(['price' => $price]))->assertUnprocessable()->assertJsonValidationErrors('price');
        }
        foreach ([-1, 1.5, 'x', 2147483648, null] as $stock) {
            $this->postJson($this->url(), $this->valid(['stock' => $stock]))->assertUnprocessable()->assertJsonValidationErrors('stock');
        }
        $response = $this->postJson($this->url(), $this->valid(['sku' => 'APX-0002', 'slug' => 'product-002']))->assertUnprocessable();
        $response->assertJsonValidationErrors(['sku', 'slug'])->assertJsonStructure(['message', 'code', 'errors'])->assertJson(['code' => 'validation_failed']);
        $this->postJson($this->url(), $this->valid(['attributes' => ['a', 'b']]))->assertUnprocessable()->assertJsonValidationErrors('attributes');
        $this->postJson($this->url(), $this->valid(['tags' => ['a', 'a']]))->assertUnprocessable();
        $this->postJson($this->url(), $this->valid(['slug' => 'Bad Slug']))->assertUnprocessable()->assertJsonValidationErrors('slug');
        $this->postJson($this->url(), [])->assertUnprocessable()->assertJsonValidationErrors(['name', 'sku', 'category', 'price', 'stock', 'active']);
    }

    public function test_update_may_keep_its_own_sku_and_slug_but_not_take_anothers(): void
    {
        $this->patchJson($this->url('product-002'), ['sku' => 'APX-0002', 'slug' => 'product-002'])->assertOk();
        $this->patchJson($this->url('product-002'), ['sku' => 'APX-0004'])->assertUnprocessable()->assertJsonValidationErrors('sku');
    }

    public function test_malformed_json_is_400_and_other_error_statuses_have_the_standard_body(): void
    {
        $this->call('POST', $this->url(), [], [], [], ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'], '{"name": ')
            ->assertStatus(400)->assertJson(['code' => 'malformed_json'])->assertJsonStructure(['message', 'code']);
        $this->putJson('/api/workspaces/ws-1/products', [])->assertStatus(405)->assertJson(['code' => 'method_not_allowed']);
        $this->getJson('/api/nowhere')->assertNotFound()->assertJson(['code' => 'not_found']);
    }

    public function test_unexpected_errors_are_500_without_leaking_internals(): void
    {
        config(['app.debug' => true]);
        Route::get('/api/_boom', fn () => throw new \RuntimeException('secret /var/www/path SELECT * FROM x'));
        $response = $this->getJson('/api/_boom')->assertStatus(500)->assertExactJson(['message' => 'Server error.', 'code' => 'server_error']);
        $this->assertStringNotContainsString('secret', $response->getContent());
    }

    public function test_slug_is_generated_and_made_unique_when_omitted(): void
    {
        $a = $this->postJson($this->url(), $this->valid(['name' => 'Same Name']))->assertCreated()->json('data.slug');
        $b = $this->postJson($this->url(), $this->valid(['name' => 'Same Name']))->assertCreated()->json('data.slug');
        $this->assertSame('same-name', $a);
        $this->assertSame('same-name-2', $b);
    }

    public function test_existing_fixture_ids_and_counts_are_preserved(): void
    {
        $this->assertSame(120, Product::count());
        $this->assertSame(60, Product::where('workspace_id', 'ws-1')->count());
        $this->assertSame(['product-002', 'product-004'], array_slice(array_column($this->getJson($this->url().'?per_page=2')->json('data'), 'id'), 0, 2));
    }
}
