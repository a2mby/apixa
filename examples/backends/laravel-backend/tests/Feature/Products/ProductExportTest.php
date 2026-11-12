<?php

namespace Tests\Feature\Products;

use App\Models\Product;
use App\Services\Products\ProductTransferService;
use Illuminate\Http\UploadedFile;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProductExportTest extends ProductApiTestCase
{
    private function export(string $query = '', string $workspace = 'ws-1')
    {
        return $this->get($this->url('exports', $workspace).'?'.$query, ['Accept' => '*/*']);
    }

    /** @return list<array<string, string>> */
    private function parseCsv(string $csv): array
    {
        $rows = [];
        $h = fopen('php://memory', 'w+');
        fwrite($h, $csv);
        rewind($h);
        $header = fgetcsv($h, 0, ',', '"', '');
        while (($cells = fgetcsv($h, 0, ',', '"', '')) !== false) {
            $rows[] = array_combine($header, $cells);
        }

        return $rows;
    }

    public function test_csv_export_has_download_headers_utf8_and_every_row(): void
    {
        $r = $this->export('format=csv')->assertOk();
        $this->assertInstanceOf(StreamedResponse::class, $r->baseResponse, 'the export is streamed, not built in memory');
        $this->assertSame('text/csv; charset=UTF-8', $r->headers->get('Content-Type'));
        $this->assertMatchesRegularExpression('/^attachment; filename=products-ws-1-\d{8}-\d{6}\.csv$/', $r->headers->get('Content-Disposition'));
        $content = $r->streamedContent();
        $this->assertStringStartsWith("id,sku,slug,name,category,price,stock,active,tags,attributes,created_at,updated_at\r\n", $content, 'no BOM');
        $this->assertTrue(mb_check_encoding($content, 'UTF-8'));

        $rows = $this->parseCsv($content);
        $this->assertCount(60, $rows);
        $byId = array_column($rows, null, 'id');
        $db = Product::findOrFail('product-004');
        $this->assertSame([$db->name, '5.48', '4', 'false', 'manual|sale'], [$byId['product-004']['name'], $byId['product-004']['price'], $byId['product-004']['stock'], $byId['product-004']['active'], $byId['product-004']['tags']]);
        $this->assertSame($db->attributes, json_decode($byId['product-004']['attributes'], true));
        $this->assertStringContainsString('شاشة', $content, 'non-ASCII is not escaped');
    }

    public function test_json_export_is_one_valid_document_with_the_same_shape_as_the_api(): void
    {
        $r = $this->export('format=json')->assertOk();
        $this->assertSame('application/json', $r->headers->get('Content-Type'));
        $this->assertStringContainsString('attachment; filename=products-ws-1-', $r->headers->get('Content-Disposition'));
        $doc = json_decode($r->streamedContent(), true);
        $this->assertSame(60, $doc['meta']['count']);
        $this->assertCount(60, $doc['data']);
        $this->assertSame($this->getJson($this->url('product-002'))->json('data'), array_column($doc['data'], null, 'id')['product-002']);
    }

    public function test_ndjson_export_streams_one_json_object_per_line(): void
    {
        $r = $this->export('format=ndjson&sort=-price')->assertOk();
        $this->assertSame('application/x-ndjson', $r->headers->get('Content-Type'));
        $content = $r->streamedContent();
        $this->assertStringEndsWith("\n", $content);
        $lines = explode("\n", rtrim($content, "\n"));
        $this->assertCount(60, $lines);
        $decoded = array_map(fn ($l) => json_decode($l, true, flags: JSON_THROW_ON_ERROR), $lines);
        $prices = array_map(fn ($d) => (float) $d['price'], $decoded);
        $sorted = $prices;
        rsort($sorted);
        $this->assertSame($sorted, $prices, 'sorting applies to exports');
        $this->assertSame(['ws-1'], array_values(array_unique(array_column($decoded, 'workspace_id'))));
    }

    public function test_default_format_is_csv_and_invalid_options_are_422(): void
    {
        $this->assertSame('text/csv; charset=UTF-8', $this->export()->headers->get('Content-Type'));
        foreach (['format=xml', 'format=csv&sort=sku', 'format=csv&per_page=0', 'format=csv&category[]='.str_repeat('x', 101)] as $bad) {
            $this->getJson($this->url('exports').'?'.$bad)->assertUnprocessable()->assertJson(['code' => 'validation_failed']);
        }
        $this->getJson('/api/workspaces/nope/products/exports')->assertNotFound();
    }

    public function test_filters_and_workspace_scope_apply_to_exports(): void
    {
        $rows = $this->parseCsv($this->export('format=csv&category=office&active=true&q=a')->streamedContent());
        $expected = Product::where('workspace_id', 'ws-1')->where('category', 'office')->where('active', true)->where(fn ($q) => $q->where('name', 'ilike', '%a%')->orWhere('sku', 'ilike', '%a%')->orWhere('slug', 'ilike', '%a%'))->count();
        $this->assertCount($expected, $rows);
        $this->assertSame(['office'], array_values(array_unique(array_column($rows, 'category'))));
        $ws2 = $this->parseCsv($this->export('format=csv', 'ws-2')->streamedContent());
        $this->assertCount(60, $ws2);
        $this->assertSame([], array_intersect(array_column($ws2, 'id'), array_column($this->parseCsv($this->export('format=csv')->streamedContent()), 'id')));
    }

    public function test_empty_results_are_still_valid_files(): void
    {
        $this->assertCount(1, explode("\r\n", trim($this->export('format=csv', 'ws-3')->streamedContent(), "\r\n")), 'header only');
        $json = json_decode($this->export('format=json', 'ws-3')->streamedContent(), true);
        $this->assertSame([[], 0], [$json['data'], $json['meta']['count']]);
        $this->assertSame('', $this->export('format=ndjson', 'ws-3')->streamedContent());
    }

    public function test_spreadsheet_formula_injection_is_neutralised_in_csv_only(): void
    {
        $evil = $this->make(['name' => '=HYPERLINK("http://x","y")', 'attributes' => ['note' => '+1']]);
        $csv = $this->export('format=csv&q='.urlencode('HYPERLINK'))->streamedContent();
        $this->assertStringContainsString("\"'=HYPERLINK(", $csv);
        $this->assertStringNotContainsString('"=HYPERLINK(', $csv);
        $this->assertStringContainsString('=HYPERLINK', $this->export('format=ndjson&q=HYPERLINK')->streamedContent(), 'JSON keeps the exact value');
        $this->assertSame('=HYPERLINK("http://x","y")', Product::find($evil->id)->name);
    }

    public function test_chunked_streaming_neither_skips_nor_repeats_rows_across_chunk_boundaries(): void
    {
        $now = now();
        $rows = [];
        for ($i = 1; $i <= 1200; $i++) {
            $rows[] = ['id' => sprintf('bulk-%05d', $i), 'workspace_id' => 'ws-3', 'sku' => "BULK-$i", 'slug' => "bulk-$i", 'name' => "Bulk $i", 'category' => 'bulk', 'price' => '1.00', 'stock' => $i % 7, 'active' => true, 'tags' => '[]', 'attributes' => '{}', 'created_at' => $now, 'updated_at' => $now];
        }
        foreach (array_chunk($rows, 300) as $chunk) {
            Product::insert($chunk);
        }
        foreach ([7, 500, 1200, 5000] as $chunkSize) {
            config(['products.export.chunk_size' => $chunkSize]);
            $ids = array_map(fn ($l) => json_decode($l, true)['id'], explode("\n", rtrim($this->export('format=ndjson', 'ws-3')->streamedContent(), "\n")));
            $this->assertCount(1200, $ids, "chunk $chunkSize");
            $this->assertCount(1200, array_unique($ids));
            $this->assertSame(array_column($rows, 'id'), $ids, 'id order is the stable default');
        }
        $this->assertCount(1200, $this->parseCsv($this->export('format=csv', 'ws-3')->streamedContent()));
    }

    public function test_export_then_import_round_trips_the_data(): void
    {
        $made = [
            $this->make(['name' => 'Comma, "quote"', 'tags' => ['a b', 'c'], 'attributes' => ['x' => ['y' => []], 'z' => (object) []]]),
            $this->make(['name' => 'شاشة', 'price' => '0.05', 'stock' => 0, 'active' => false, 'tags' => [], 'attributes' => []]),
        ];
        $skus = array_map(fn ($p) => $p->sku, $made);
        $cols = ['sku', 'slug', 'name', 'category', 'price', 'stock', 'active', 'tags', 'attributes'];
        $snapshot = fn () => Product::whereIn('sku', $skus)->orderBy('sku')->get()->map(fn ($p) => $p->only($cols) + ['raw_attributes' => $p->getAttributes()['attributes']])->all();
        $before = $snapshot();

        foreach (['csv', 'json'] as $format) {
            $content = $this->export("format=$format&category=office&per_page=100")->streamedContent();
            if ($format === 'csv') {
                $lines = array_filter($this->parseCsv($content), fn ($r) => in_array($r['sku'], $skus, true));
                $h = fopen('php://memory', 'w+');
                fputcsv($h, array_keys(reset($lines)), ',', '"', '');
                foreach ($lines as $l) {
                    fputcsv($h, $l, ',', '"', '');
                }
                rewind($h);
                $filtered = stream_get_contents($h);
            } else {
                $filtered = json_encode(array_values(array_filter(json_decode($content)->data, fn ($r) => in_array($r->sku, $skus, true)))); // decode as objects so {} stays {}
            }
            $this->assertNotSame('[]', $filtered);
            Product::whereIn('sku', $skus)->delete();
            $file = UploadedFile::fake()->createWithContent("round.$format", $filtered);
            $this->call('POST', $this->url('imports'), [], [], ['file' => $file], ['CONTENT_TYPE' => 'multipart/form-data; boundary=x', 'HTTP_ACCEPT' => 'application/json'])->assertOk()->assertJsonPath('data.created', 2);
            $after = $snapshot();
            $this->assertEquals($before, $after, "$format round trip");
        }
    }

    public function test_preview_reports_the_count_a_sample_and_formats_without_streaming(): void
    {
        $p = $this->getJson($this->url('exports/preview').'?category=office&limit=3')->assertOk()->json('data');
        $this->assertSame(Product::where('workspace_id', 'ws-1')->where('category', 'office')->count(), $p['count']);
        $this->assertCount(3, $p['sample']);
        $this->assertSame(['csv', 'json', 'ndjson'], array_keys($p['formats']));
        $this->assertSame(ProductTransferService::EXPORT_COLUMNS, $p['csv_columns']);
        $this->assertCount(5, $this->getJson($this->url('exports/preview'))->json('data.sample'), 'default sample size');
        $this->getJson($this->url('exports/preview').'?limit=21')->assertUnprocessable();
        $this->assertSame(0, $this->getJson($this->url('exports/preview', 'ws-3'))->json('data.count'));
    }
}
