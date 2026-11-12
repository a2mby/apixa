<?php

namespace Tests\Feature\Products;

use App\Models\Product;
use Illuminate\Support\Facades\DB;

class ProductQueryTest extends ProductApiTestCase
{
    private function ids(string $query): array
    {
        return array_column($this->getJson($this->url().'?per_page=100&'.$query)->assertOk()->json('data'), 'id');
    }

    private function expected(callable $filter): array
    {
        return Product::where('workspace_id', 'ws-1')->orderBy('id')->get()->filter($filter)->pluck('id')->values()->all();
    }

    public function test_pagination_meta_and_workspace_isolation(): void
    {
        $r = $this->getJson($this->url().'?per_page=25&page=2')->assertOk();
        $this->assertSame(60, $r->json('meta.total'));
        $this->assertSame(25, $r->json('meta.per_page'));
        $this->assertSame(2, $r->json('meta.current_page'));
        $this->assertSame(3, $r->json('meta.last_page'));
        $this->assertCount(25, $r->json('data'));
        $this->assertSame([], array_diff(array_unique(array_column($r->json('data'), 'workspace_id')), ['ws-1']));
        $this->assertSame(60, $this->getJson($this->url('', 'ws-2'))->json('meta.total'));
        $this->assertSame(0, $this->getJson($this->url('', 'ws-3'))->json('meta.total'), 'an empty workspace is really empty');
        $this->assertSame([], $this->getJson($this->url('', 'ws-3'))->json('data'));
    }

    public function test_default_and_maximum_page_size(): void
    {
        $this->assertCount(15, $this->getJson($this->url())->json('data'));
        $this->getJson($this->url().'?per_page=101')->assertUnprocessable()->assertJsonValidationErrors('per_page');
        $this->getJson($this->url().'?per_page=0')->assertUnprocessable();
        $this->getJson($this->url().'?page=0')->assertUnprocessable();
    }

    public function test_pages_never_overlap_or_skip_even_when_the_sort_key_ties(): void
    {
        $seen = [];
        for ($page = 1; $page <= 6; $page++) {
            $seen = array_merge($seen, array_column($this->getJson($this->url()."?per_page=10&page=$page&sort=category")->json('data'), 'id'));
        }
        $this->assertCount(60, $seen);
        $this->assertCount(60, array_unique($seen));
    }

    public function test_search_matches_name_sku_and_slug_case_insensitively_and_escapes_wildcards(): void
    {
        $this->assertSame(['product-004', 'product-044'], $this->ids('q='.urlencode('شاشة 4')), 'unicode substring search');
        $this->assertContains('product-002', $this->ids('q=NOTEBOOK'));
        $this->assertSame(['product-002'], $this->ids('q=apx-0002'));
        $this->assertSame(['product-002'], $this->ids('q=product-002'));
        $this->assertSame([], $this->ids('q=%25'), 'a literal % matches nothing instead of everything');
        $this->assertSame([], $this->ids('q=_'));
        $this->assertCount(60, $this->ids('q='), 'an empty search is no filter');
    }

    public function test_category_filter_accepts_repeated_and_comma_forms(): void
    {
        $expected = $this->expected(fn ($p) => in_array($p->category, ['office', 'accessories'], true));
        $this->assertSame($expected, $this->ids('category[]=office&category[]=accessories'));
        $this->assertSame($expected, $this->ids('category=office,accessories'));
        $this->assertSame($this->expected(fn ($p) => $p->category === 'office'), $this->ids('category=office'));
        $this->assertSame([], $this->ids('category=missing'));
    }

    public function test_active_price_and_stock_filters(): void
    {
        $this->assertSame($this->expected(fn ($p) => $p->active), $this->ids('active=true'));
        $this->assertSame($this->expected(fn ($p) => ! $p->active), $this->ids('active=false'));
        $this->assertSame($this->expected(fn ($p) => $p->price >= 20 && $p->price <= 50), $this->ids('price_min=20&price_max=50'));
        $this->assertSame($this->expected(fn ($p) => $p->stock >= 10 && $p->stock <= 12), $this->ids('stock_min=10&stock_max=12'));
        $this->assertSame($this->expected(fn ($p) => $p->stock > 0), $this->ids('in_stock=true'));
        $this->assertSame($this->expected(fn ($p) => $p->stock === 0), $this->ids('in_stock=false'));
        $this->assertSame($this->expected(fn ($p) => $p->stock > 0 && $p->stock <= 9), $this->ids('low_stock=true&low_stock_threshold=9'));
        $this->getJson($this->url().'?price_min=5&price_max=1')->assertUnprocessable();
        $this->getJson($this->url().'?active=maybe')->assertUnprocessable()->assertJsonValidationErrors('active');
    }

    public function test_tag_filter_any_versus_all(): void
    {
        $any = $this->expected(fn ($p) => array_intersect(['sale', 'regular'], $p->tags));
        $all = $this->expected(fn ($p) => count(array_intersect(['sale', 'manual'], $p->tags)) === 2);
        $this->assertSame($any, $this->ids('tags[]=sale&tags[]=regular'));
        $this->assertSame($any, $this->ids('tags=sale,regular&tags_match=any'));
        $this->assertSame($all, $this->ids('tags[]=sale&tags[]=manual&tags_match=all'));
        $this->assertNotEmpty($all);
        $this->assertSame([], $this->ids('tags[]=sale&tags[]=regular&tags_match=all'), 'no product is both');
        $this->getJson($this->url().'?tags_match=some')->assertUnprocessable();
    }

    public function test_nested_attribute_filters_are_whitelisted(): void
    {
        $this->assertSame($this->expected(fn ($p) => $p->attributes['color'] === 'blue'), $this->ids('attr[color]=blue'));
        $this->assertSame($this->expected(fn ($p) => $p->attributes['dimensions']['width'] === 4), $this->ids('attr[dimensions.width]=4'));
        $this->assertSame($this->expected(fn ($p) => true), $this->ids('attr[variant]=a'));
        $this->assertSame([], $this->ids('attr[variant]=zzz'));
        $this->getJson($this->url().'?attr[password]=x')->assertUnprocessable();
        $this->getJson($this->url().'?attr[dimensions.width]=abc')->assertUnprocessable();
        $this->getJson($this->url().'?'.http_build_query(['attr' => ["color') OR 1=1 --" => 'x']]))->assertUnprocessable();
    }

    public function test_date_ranges_including_bare_dates(): void
    {
        $this->assertCount(60, $this->ids('created_from=2026-01-01&created_to=2026-01-01'), 'a bare end date means through the end of that day');
        $this->assertSame([], $this->ids('created_to=2025-12-31'));
        $this->assertCount(60, $this->ids('created_from=2026-01-01T08:59:59Z&created_to=2026-01-01T09:00:01Z'), 'fixtures are 2026-01-01T09:00:00Z');
        $this->assertSame([], $this->ids('created_from=2026-01-01T09:00:01Z'));
        $this->assertMatchesRegularExpression('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/', $this->getJson($this->url('product-002'))->json('data.created_at'), 'timestamps are always UTC');
        $this->assertSame([], $this->ids('updated_from=2099-01-01'));
        $this->getJson($this->url().'?created_from=2026-02-01&created_to=2026-01-01')->assertUnprocessable();
        $this->getJson($this->url().'?created_from=not-a-date')->assertUnprocessable();
    }

    public function test_sorting_single_multiple_descending_and_invalid_fields(): void
    {
        $prices = array_map('floatval', array_column($this->getJson($this->url().'?per_page=100&sort=-price')->json('data'), 'price'));
        $sorted = $prices;
        rsort($sorted);
        $this->assertSame($sorted, $prices);

        $rows = $this->getJson($this->url().'?per_page=100&sort=category,-stock')->json('data');
        $expected = $rows;
        usort($expected, fn ($a, $b) => [$a['category'], $b['stock'], $a['id']] <=> [$b['category'], $a['stock'], $b['id']]);
        $this->assertSame(array_column($expected, 'id'), array_column($rows, 'id'));

        foreach (['sku', 'password', 'name;drop table products', 'price,price', 'name,price,stock,category', '-'] as $bad) {
            $this->getJson($this->url().'?sort='.urlencode($bad))->assertUnprocessable()->assertJsonValidationErrors('sort');
        }
        $this->assertSame(60, Product::where('workspace_id', 'ws-1')->count());
    }

    public function test_cursor_pagination_walks_every_row_exactly_once(): void
    {
        $seen = [];
        $base = $this->url().'?pagination=cursor&per_page=25&sort=-price';
        $url = $base;
        for ($i = 0; $i < 5 && $url; $i++) {
            $r = $this->getJson($url)->assertOk();
            $seen = array_merge($seen, array_column($r->json('data'), 'id'));
            $url = $r->json('meta.next_cursor') ? $base.'&cursor='.urlencode($r->json('meta.next_cursor')) : null;
        }
        $this->assertCount(60, $seen);
        $this->assertCount(60, array_unique($seen));
    }

    public function test_lookup_by_sku(): void
    {
        $this->getJson($this->url('lookup').'?sku=APX-0002')->assertOk()->assertJsonPath('data.id', 'product-002')->assertHeader('ETag');
        $this->getJson($this->url('lookup').'?sku=APX-0001')->assertNotFound(); // ws-2's product
        $this->getJson($this->url('lookup'))->assertUnprocessable()->assertJsonValidationErrors('sku');
    }

    public function test_low_stock_and_out_of_stock_reuse_the_list_filters(): void
    {
        $low = $this->getJson($this->url('low-stock').'?threshold=3&per_page=100')->assertOk()->json('data');
        $this->assertSame($this->expected(fn ($p) => $p->stock > 0 && $p->stock <= 3), array_column($low, 'id'));
        $out = $this->getJson($this->url('out-of-stock').'?per_page=100')->assertOk();
        $this->assertSame($this->expected(fn ($p) => $p->stock === 0), array_column($out->json('data'), 'id'));
        $this->assertNotEmpty($out->json('data'));
        $narrowed = $this->getJson($this->url('out-of-stock').'?category=office&per_page=100')->json('data');
        $this->assertSame($this->expected(fn ($p) => $p->stock === 0 && $p->category === 'office'), array_column($narrowed, 'id'));
        $this->getJson($this->url('low-stock').'?threshold=-1')->assertUnprocessable();
    }

    public function test_filters_endpoint_describes_the_filter_panel(): void
    {
        $d = $this->getJson($this->url('filters'))->assertOk()->json('data');
        $this->assertEqualsCanonicalizing(['office', 'accessories', 'electronics'], array_column($d['categories'], 'value'));
        $this->assertSame(60, array_sum(array_column($d['categories'], 'count')));
        $tags = array_column($d['tags'], 'count', 'value');
        $this->assertSame(Product::where('workspace_id', 'ws-1')->whereJsonContains('tags', 'sale')->count(), $tags['sale']);
        $this->assertSame(['color'], array_keys($d['attribute_values']));
        $this->assertSame(['name', 'price', 'stock', 'category', 'created_at', 'updated_at'], $d['sortable']);
        $this->assertSame(100, $d['pagination']['max_per_page']);
        $empty = $this->getJson($this->url('filters', 'ws-3'))->json('data');
        $this->assertSame([[], [], null], [$empty['categories'], $empty['tags'], $empty['price']['min']]);
    }

    public function test_stats_match_independent_calculations_and_keep_decimal_precision(): void
    {
        $rows = Product::where('workspace_id', 'ws-1')->get();
        $s = $this->getJson($this->url('stats'))->assertOk()->json('data');
        $this->assertSame(60, $s['total']);
        $this->assertSame($rows->where('active', true)->count(), $s['active']);
        $this->assertSame($rows->where('active', false)->count(), $s['inactive']);
        $this->assertSame($rows->where('stock', '>', 0)->count(), $s['in_stock']);
        $this->assertSame($rows->where('stock', 0)->count(), $s['out_of_stock']);
        $this->assertSame($rows->filter(fn ($p) => $p->stock > 0 && $p->stock <= 5)->count(), $s['low_stock']);
        $this->assertSame((int) $rows->sum('stock'), $s['total_stock_units']);
        $value = array_reduce($rows->all(), fn ($c, $p) => bcadd($c, bcmul((string) $p->price, (string) $p->stock, 2), 2), '0.00');
        $this->assertSame($value, $s['inventory_value']);
        $this->assertSame(60, array_sum(array_column($s['categories'], 'products')));
        $this->assertSame($s['inventory_value'], array_reduce($s['categories'], fn ($c, $k) => bcadd($c, $k['inventory_value'], 2), '0.00'));
        $this->assertSame(2, $this->getJson($this->url('stats').'?threshold=2')->json('data.low_stock_threshold'));
    }

    public function test_stats_for_an_empty_workspace_are_zero_not_null(): void
    {
        $s = $this->getJson($this->url('stats', 'ws-3'))->assertOk()->json('data');
        $this->assertSame([0, 0, 0, '0.00', []], [$s['total'], $s['total_stock_units'], $s['low_stock'], $s['inventory_value'], $s['categories']]);
        $this->assertNull($s['price']['min']);
    }

    public function test_stats_reflect_mutations_and_use_aggregate_queries_not_row_loading(): void
    {
        $before = $this->getJson($this->url('stats'))->json('data');
        $this->make(['price' => '10.10', 'stock' => 3, 'category' => 'brand-new']);
        $queries = [];
        DB::listen(fn ($q) => $queries[] = $q->sql);
        $after = $this->getJson($this->url('stats'))->json('data');
        $this->assertLessThanOrEqual(3, count($queries), 'a constant number of aggregate queries regardless of row count');
        $this->assertSame($before['total'] + 1, $after['total']);
        $this->assertSame(bcadd($before['inventory_value'], '30.30', 2), $after['inventory_value']);
        $this->assertContains('brand-new', array_column($after['categories'], 'category'));
    }

    public function test_list_uses_a_constant_number_of_queries(): void
    {
        $queries = 0;
        DB::listen(function () use (&$queries) {
            $queries++;
        });
        $this->getJson($this->url().'?per_page=50')->assertOk();
        $this->assertLessThanOrEqual(3, $queries);
    }
}
