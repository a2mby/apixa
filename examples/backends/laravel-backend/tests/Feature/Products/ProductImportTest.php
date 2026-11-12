<?php

namespace Tests\Feature\Products;

use App\Models\Product;
use Illuminate\Http\UploadedFile;
use Illuminate\Testing\TestResponse;

class ProductImportTest extends ProductApiTestCase
{
    private const HEADER = "sku,slug,name,category,price,stock,active,tags,attributes\n";

    private function upload(string $content, string $name = 'products.csv', array $fields = [], ?string $url = null): TestResponse
    {
        $file = UploadedFile::fake()->createWithContent($name, $content);

        return $this->call('POST', $url ?? $this->url('imports'), $fields, [], ['file' => $file], ['CONTENT_TYPE' => 'multipart/form-data; boundary=x', 'HTTP_ACCEPT' => 'application/json']);
    }

    private function sku(string $sku): ?Product
    {
        return Product::where('sku', $sku)->first();
    }

    public function test_valid_csv_creates_products_with_exact_values(): void
    {
        $csv = self::HEADER
            .'IMP-1,imp-one,"Widget, ""large""",office,19.90,5,true,sale|new,"{""color"":""red"",""dims"":{""w"":1},""empty"":{}}"'."\n"
            .'IMP-2,,شاشة,accessories,0,0,no,,'."\n"
            ."IMP-3,,\"Multi\nLine\",electronics,7,2147483647,1,,\n";
        $r = $this->upload($csv)->assertOk();
        $this->assertSame([3, 3, 0, 0], [$r->json('data.total'), $r->json('data.created'), $r->json('data.updated'), $r->json('data.failed')]);

        $one = $this->sku('IMP-1');
        $this->assertSame(['imp-one', 'Widget, "large"', '19.90', 5, true, 'ws-1', ['sale', 'new']], [$one->slug, $one->name, (string) $one->price, $one->stock, $one->active, $one->workspace_id, $one->tags]);
        $this->assertStringContainsString('"empty":{}', $this->getJson($this->url($one->id))->getContent(), 'nested {} survives CSV import');
        $two = $this->sku('IMP-2');
        $this->assertSame(['شاشة', '0.00', 0, false, [], 'imp-2'], [$two->name, (string) $two->price, $two->stock, $two->active, $two->tags, $two->slug]);
        $this->assertStringContainsString('"attributes":{}', $this->getJson($this->url($two->id))->getContent());
        $this->assertSame("Multi\nLine", $this->sku('IMP-3')->name);
        $this->assertSame(2147483647, $this->sku('IMP-3')->stock);
        $this->assertSame(123, Product::count());
    }

    public function test_bom_crlf_and_read_only_columns_are_accepted(): void
    {
        $csv = "\xEF\xBB\xBFid,sku,name,category,price,stock,created_at\r\nignored,BOM-1,Name,office,1.5,1,2000-01-01\r\n";
        $this->upload($csv)->assertOk()->assertJsonPath('data.created', 1);
        $this->assertSame('1.50', (string) $this->sku('BOM-1')->price);
        $this->assertNotSame('ignored', $this->sku('BOM-1')->id, 'the id column is read-only');
    }

    public function test_invalid_rows_abort_the_whole_import_with_row_level_errors(): void
    {
        $csv = self::HEADER."OK-1,,Good,office,1,1,,,\nBAD-1,,,office,-5,1,,,\nBAD-2,,Name,office,abc,1.5,maybe,,[1]\nBAD 3,,Name,office,1,1,,,\nOK-2,,Good2,office,1,1,,,\n";
        $r = $this->upload($csv)->assertUnprocessable()->assertJson(['code' => 'import_failed', 'data' => ['created' => 0, 'failed' => 3, 'total' => 5]]);
        $rows = array_column($r->json('data.errors'), null, 'row');
        $this->assertSame([3, 4, 5], array_keys($rows), 'row numbers are file line numbers (header = line 1)');
        $this->assertEqualsCanonicalizing(['name', 'price'], array_keys($rows[3]['errors']));
        $this->assertEqualsCanonicalizing(['price', 'stock', 'active', 'attributes'], array_keys($rows[4]['errors']));
        $this->assertSame('BAD-1', $rows[3]['sku']);
        $this->assertSame(120, Product::count(), 'nothing was written, not even the valid rows');
    }

    public function test_skip_mode_imports_valid_rows_and_reports_the_rest(): void
    {
        $csv = self::HEADER."OK-1,,Good,office,1,1,,,\nBAD-1,,,office,-5,1,,,\nOK-2,,Good2,office,2,2,,,\n";
        $r = $this->upload($csv, fields: ['on_error' => 'skip'])->assertOk();
        $this->assertSame([3, 2, 1], [$r->json('data.total'), $r->json('data.created'), $r->json('data.failed')]);
        $this->assertNotNull($this->sku('OK-1'));
        $this->assertNotNull($this->sku('OK-2'));
        $this->assertNull($this->sku('BAD-1'));
    }

    public function test_malformed_rows_and_bad_headers(): void
    {
        $r = $this->upload(self::HEADER."A-1,,Name,office,1\nA-2,,Name,office,1,1,,,\n", fields: ['on_error' => 'skip'])->assertOk();
        $this->assertSame('malformed_row', $r->json('data.errors.0.code'));
        $this->assertSame([1, 1], [$r->json('data.created'), $r->json('data.failed')]);
        $this->upload("sku,name,wat\nX,Y,Z\n")->assertUnprocessable()->assertJson(['code' => 'invalid_file']);
        $this->upload("name,price\nX,1\n")->assertUnprocessable()->assertJson(['code' => 'invalid_file']);
        $this->upload("sku,sku\nX,Y\n")->assertUnprocessable()->assertJson(['code' => 'invalid_file']);
    }

    public function test_empty_files_are_rejected(): void
    {
        $this->upload('')->assertUnprocessable()->assertJson(['code' => 'empty_import']);
        $this->upload(self::HEADER)->assertUnprocessable()->assertJson(['code' => 'empty_import']);
        $this->upload('[]', 'p.json')->assertUnprocessable()->assertJson(['code' => 'empty_import']);
    }

    public function test_create_mode_rejects_existing_skus_and_upsert_updates_only_provided_fields(): void
    {
        $before = Product::findOrFail('product-002');
        $r = $this->upload("sku,name\nAPX-0002,Renamed\n")->assertUnprocessable();
        $this->assertSame('sku_exists', $r->json('data.errors.0.code'));
        $this->assertSame($before->name, $before->fresh()->name);

        $r = $this->upload("sku,stock\nAPX-0002,77\nNEW-U,\n", fields: ['mode' => 'upsert', 'on_error' => 'skip'])->assertOk();
        $this->assertSame([0, 1, 1], [$r->json('data.created'), $r->json('data.updated'), $r->json('data.failed')], 'a new SKU still needs its required fields');
        $after = Product::findOrFail('product-002');
        $this->assertSame([77, $before->name, (string) $before->price, $before->tags, $before->slug], [$after->stock, $after->name, (string) $after->price, $after->tags, $after->slug]);

        $this->upload("sku,name,category,price,stock\nAPX-0002,Same,office,1,1\nNEW-U2,Brand,office,1,1\n", fields: ['mode' => 'upsert'])
            ->assertOk()->assertJson(['data' => ['created' => 1, 'updated' => 1]]);
    }

    public function test_a_sku_owned_by_another_workspace_is_never_touched(): void
    {
        $r = $this->upload("sku,name\nAPX-0001,Hijack\n", fields: ['mode' => 'upsert'])->assertUnprocessable();
        $this->assertSame('sku_taken', $r->json('data.errors.0.code'));
        $this->assertSame('Camera 1', Product::findOrFail('product-001')->name);
    }

    public function test_duplicates_inside_the_file_and_slug_conflicts(): void
    {
        $r = $this->upload(self::HEADER."D-1,,A,office,1,1,,,\nD-1,,B,office,1,1,,,\nD-2,product-002,C,office,1,1,,,\nD-3,same,D,office,1,1,,,\nD-4,same,E,office,1,1,,,\n", fields: ['on_error' => 'skip'])->assertOk();
        $codes = array_column($r->json('data.errors'), 'code', 'row');
        $this->assertSame([3 => 'duplicate_in_file', 4 => 'slug_taken', 6 => 'slug_taken'], $codes);
        $this->assertSame(2, $r->json('data.created'));
        $this->assertSame('A', $this->sku('D-1')->name, 'the first occurrence wins');
    }

    public function test_json_import_array_and_wrapped_forms(): void
    {
        $array = json_encode([['sku' => 'J-1', 'name' => 'Json', 'category' => 'office', 'price' => 9.5, 'stock' => 1, 'active' => false, 'tags' => ['a'], 'attributes' => ['n' => (object) []]]]);
        $this->upload($array, 'p.json')->assertOk()->assertJsonPath('data.created', 1);
        $this->assertSame(['9.50', false], [(string) $this->sku('J-1')->price, $this->sku('J-1')->active]);
        $this->assertStringContainsString('"attributes":{"n":{}}', $this->getJson($this->url($this->sku('J-1')->id))->getContent());

        $this->upload(json_encode(['products' => [['sku' => 'J-2', 'name' => 'W', 'category' => 'office', 'price' => '1', 'stock' => 0]]]), 'p.json')->assertOk();
        $this->assertNotNull($this->sku('J-2'));
    }

    public function test_json_errors(): void
    {
        $this->upload('{oops', 'p.json')->assertUnprocessable()->assertJson(['code' => 'invalid_file']);
        $this->upload('"a string"', 'p.json')->assertUnprocessable()->assertJson(['code' => 'invalid_file']);
        $r = $this->upload(json_encode([['sku' => 'J-3', 'name' => 'X', 'category' => 'c', 'price' => 1, 'stock' => 1, 'color' => 'red'], 'x', ['sku' => 'J-4', 'name' => 'ok', 'category' => 'c', 'price' => 1, 'stock' => 1]]), 'p.json', ['on_error' => 'skip'])->assertOk();
        $this->assertSame([1, 2], [$r->json('data.created'), $r->json('data.failed')]);
        $this->assertSame('invalid_row', $r->json('data.errors.0.code'), 'unknown fields are rejected, not silently dropped');
        $this->upload(json_encode([['sku' => 'J-5', 'name' => 'X', 'category' => 'c', 'price' => 0.1 + 0.2, 'stock' => 1]]), 'p.json')->assertUnprocessable();
    }

    public function test_dry_run_validates_without_writing(): void
    {
        $r = $this->upload("sku,name,category,price,stock\nDRY-1,A,office,1,1\nDRY-2,,office,1,1\n", fields: ['dry_run' => '1'])->assertOk();
        $this->assertSame([true, 1, 1, 2], [$r->json('data.dry_run'), $r->json('data.created'), $r->json('data.failed'), $r->json('data.total')]);
        $this->assertNull($this->sku('DRY-1'));
        $this->assertSame(120, Product::count());
    }

    public function test_media_type_extension_and_missing_file_checks(): void
    {
        $this->upload('x', 'p.txt')->assertStatus(415)->assertJson(['code' => 'unsupported_media_type']);
        $this->upload('MZ...', 'p.exe')->assertStatus(415);
        $this->upload('[]', 'p.csv')->assertUnprocessable(); // JSON text in a .csv is read as CSV, and has no sku column
        $this->upload("\x89PNG\r\n\x1a\n\0\0", 'p.csv')->assertStatus(415);
        $this->postJson($this->url('imports'), ['products' => []])->assertStatus(415);
        $this->call('POST', $this->url('imports'), [], [], [], ['CONTENT_TYPE' => 'multipart/form-data; boundary=x', 'HTTP_ACCEPT' => 'application/json'])->assertUnprocessable()->assertJsonValidationErrors('file');
        $this->upload(self::HEADER, fields: ['mode' => 'replace'])->assertUnprocessable()->assertJsonValidationErrors('mode');
        $this->upload(self::HEADER, fields: ['on_error' => 'x'])->assertUnprocessable()->assertJsonValidationErrors('on_error');
    }

    public function test_oversized_files_and_too_many_rows_are_rejected_with_413(): void
    {
        config(['products.import.max_kilobytes' => 1]);
        $this->upload(self::HEADER.str_repeat("S-1,,N,office,1,1,,,\n", 200))->assertStatus(413)->assertJson(['code' => 'payload_too_large']);
        config(['products.import.max_kilobytes' => 5120, 'products.import.max_rows' => 3]);
        $this->upload(self::HEADER."A,,n,c,1,1,,,\nB,,n,c,1,1,,,\nC,,n,c,1,1,,,\nD,,n,c,1,1,,,\n")->assertStatus(413)->assertJson(['code' => 'too_many_rows']);
        $this->upload(json_encode(array_fill(0, 4, ['sku' => 'X'])), 'p.json')->assertStatus(413);
        $this->assertSame(120, Product::count());
    }

    public function test_php_level_upload_limits_map_to_413_and_failed_uploads_to_422(): void
    {
        $path = tempnam(sys_get_temp_dir(), 'imp');
        $tooBig = new UploadedFile($path, 'p.csv', 'text/csv', UPLOAD_ERR_INI_SIZE, true);
        $this->call('POST', $this->url('imports'), [], [], ['file' => $tooBig], ['CONTENT_TYPE' => 'multipart/form-data; boundary=x', 'HTTP_ACCEPT' => 'application/json'])->assertStatus(413);
        $partial = new UploadedFile($path, 'p.csv', 'text/csv', UPLOAD_ERR_PARTIAL, true);
        $this->call('POST', $this->url('imports'), [], [], ['file' => $partial], ['CONTENT_TYPE' => 'multipart/form-data; boundary=x', 'HTTP_ACCEPT' => 'application/json'])->assertUnprocessable()->assertJson(['code' => 'upload_failed']);
        @unlink($path);
    }

    public function test_imports_are_rate_limited_when_configured(): void
    {
        config(['products.import.rate_per_minute' => 2]);
        $this->upload(self::HEADER, 'a.csv')->assertUnprocessable();
        $this->upload(self::HEADER, 'a.csv')->assertUnprocessable();
        $this->upload(self::HEADER, 'a.csv')->assertStatus(429)->assertJson(['code' => 'too_many_requests'])->assertHeader('Retry-After');
    }

    public function test_imports_into_one_workspace_never_write_to_another(): void
    {
        $this->upload("sku,name,category,price,stock\nWS-1,A,c,1,1\n", url: $this->url('imports', 'ws-2'))->assertOk();
        $this->assertSame('ws-2', $this->sku('WS-1')->workspace_id);
        $this->upload("sku,name,category,price,stock\nWS-2,A,c,1,1\n", url: '/api/workspaces/nope/products/imports')->assertNotFound();
    }
}
