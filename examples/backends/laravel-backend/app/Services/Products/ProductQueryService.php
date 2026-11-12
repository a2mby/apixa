<?php

namespace App\Services\Products;

use App\Http\Requests\Products\ListProductsRequest;
use App\Models\Product;
use App\Models\Workspace;
use Carbon\Carbon;
use Illuminate\Contracts\Pagination\CursorPaginator;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

/** All product reads: the filterable list (shared by lists, low-stock, exports), stats and filter metadata. */
class ProductQueryService
{
    /** @return Builder<Product> */
    public function query(Workspace $workspace, ListProductsRequest $request): Builder
    {
        $q = $workspace->products()->getQuery();
        $this->filter($q, $request);
        $this->sort($q, $request->sorts());

        return $q;
    }

    public function paginate(Builder $q, ListProductsRequest $request): LengthAwarePaginator|CursorPaginator
    {
        $per = (int) $request->query('per_page', config('products.pagination.default'));
        if ($request->query('pagination') === 'cursor' || $request->query('cursor') !== null) {
            return $q->cursorPaginate($per)->withQueryString();
        }

        return $q->paginate($per)->withQueryString();
    }

    private function filter(Builder $q, ListProductsRequest $r): void
    {
        if (($term = trim((string) $r->query('q', ''))) !== '') {
            $like = '%'.addcslashes($term, '\\%_').'%';
            $q->where(fn (Builder $w) => $w->where('name', 'ilike', $like)->orWhere('sku', 'ilike', $like)->orWhere('slug', 'ilike', $like));
        }
        if ($categories = $r->input('category')) {
            $q->whereIn('category', $categories);
        }
        if ($r->has('active')) {
            $q->where('active', $r->boolean('active'));
        }
        if ($r->has('price_min')) {
            $q->where('price', '>=', $r->input('price_min'));
        }
        if ($r->has('price_max')) {
            $q->where('price', '<=', $r->input('price_max'));
        }
        $stockMin = $r->input('stock_min');
        $stockMax = $r->input('stock_max');
        if ($r->has('in_stock')) {
            $r->boolean('in_stock') ? $q->where('stock', '>', 0) : $q->where('stock', 0);
        }
        if ($r->boolean('low_stock')) {
            $q->where('stock', '>', 0)->where('stock', '<=', (int) $r->input('low_stock_threshold', config('products.low_stock_threshold')));
        }
        if ($stockMin !== null) {
            $q->where('stock', '>=', (int) $stockMin);
        }
        if ($stockMax !== null) {
            $q->where('stock', '<=', (int) $stockMax);
        }
        if ($tags = $r->input('tags')) {
            // Containment (@>) per tag; "any" ORs them, "all" ANDs them. Uses the JSONB machinery, never string-built SQL.
            $mode = $r->input('tags_match', 'any') === 'all' ? 'where' : 'orWhere';
            $q->where(function (Builder $w) use ($tags, $mode) {
                foreach ($tags as $tag) {
                    $w->{$mode}(fn (Builder $inner) => $inner->whereJsonContains('tags', $tag));
                }
            });
        }
        foreach ((array) $r->query('attr', []) as $path => $value) {
            $q->whereRaw('attributes @> ?::jsonb', [json_encode($this->attributeDocument($path, $value))]);
        }
        foreach (['created_at' => 'created', 'updated_at' => 'updated'] as $column => $prefix) {
            if ($r->has("{$prefix}_from")) {
                // Bound with an explicit offset: the database session time zone must not shift the range.
                $q->where($column, '>=', Carbon::parse($r->input("{$prefix}_from"))->toIso8601String());
            }
            if ($r->has("{$prefix}_to")) {
                $to = (string) $r->input("{$prefix}_to");
                // A bare date means "through the end of that day".
                $q->where($column, '<=', (strlen($to) === 10 ? Carbon::parse($to)->endOfDay() : Carbon::parse($to))->toIso8601String());
            }
        }
    }

    /** Builds the containment document for a whitelisted path, e.g. dimensions.width=3 -> {"dimensions":{"width":3}}. */
    private function attributeDocument(string $path, string $value): array
    {
        $type = config('products.attributes')[$path] ?? null; // not config("a.$path"): the dot would be read as nesting
        $typed = $type === 'number' ? $value + 0 : $value;
        if ($path === 'variant') {
            return ['variants' => [['code' => $typed]]];
        }
        $doc = $typed;
        foreach (array_reverse(explode('.', $path)) as $key) {
            $doc = [$key => $doc];
        }

        return $doc;
    }

    /** @param  list<array{string, 'asc'|'desc'}>  $sorts */
    private function sort(Builder $q, array $sorts): void
    {
        foreach ($sorts as [$field, $direction]) {
            $q->orderBy($field, $direction); // $field is validated against config('products.sortable')
        }
        $q->orderBy('id'); // deterministic tiebreaker so pages never overlap or skip
    }

    /** @return array<string, mixed> */
    public function stats(Workspace $workspace, int $threshold): array
    {
        $row = DB::selectOne(
            'SELECT count(*) AS total,
                count(*) FILTER (WHERE active) AS active,
                count(*) FILTER (WHERE NOT active) AS inactive,
                count(*) FILTER (WHERE stock > 0) AS in_stock,
                count(*) FILTER (WHERE stock = 0) AS out_of_stock,
                count(*) FILTER (WHERE stock > 0 AND stock <= ?) AS low_stock,
                COALESCE(sum(stock), 0) AS total_stock_units,
                round(COALESCE(sum(price * stock), 0), 2)::text AS inventory_value,
                round(COALESCE(sum(price * stock) FILTER (WHERE active), 0), 2)::text AS active_inventory_value,
                min(price)::text AS min_price, max(price)::text AS max_price, round(avg(price), 2)::text AS average_price
             FROM products WHERE workspace_id = ?',
            [$threshold, $workspace->getKey()],
        );
        $categories = DB::select(
            'SELECT category, count(*) AS products, COALESCE(sum(stock), 0) AS stock_units, round(COALESCE(sum(price * stock), 0), 2)::text AS inventory_value
             FROM products WHERE workspace_id = ? GROUP BY category ORDER BY category',
            [$workspace->getKey()],
        );

        return [
            'total' => (int) $row->total,
            'active' => (int) $row->active,
            'inactive' => (int) $row->inactive,
            'in_stock' => (int) $row->in_stock,
            'out_of_stock' => (int) $row->out_of_stock,
            'low_stock' => (int) $row->low_stock,
            'low_stock_threshold' => $threshold,
            'total_stock_units' => (int) $row->total_stock_units,
            'inventory_value' => $row->inventory_value,
            'active_inventory_value' => $row->active_inventory_value,
            'price' => ['min' => $row->min_price, 'max' => $row->max_price, 'average' => $row->average_price],
            'categories' => array_map(fn ($c) => ['category' => $c->category, 'products' => (int) $c->products, 'stock_units' => (int) $c->stock_units, 'inventory_value' => $c->inventory_value], $categories),
        ];
    }

    /** @return array<string, mixed> */
    public function filterOptions(Workspace $workspace): array
    {
        $id = $workspace->getKey();
        $categories = DB::select('SELECT category AS value, count(*) AS count FROM products WHERE workspace_id = ? GROUP BY category ORDER BY category', [$id]);
        $tags = DB::select('SELECT tag AS value, count(*) AS count FROM products, jsonb_array_elements_text(tags) AS tag WHERE workspace_id = ? GROUP BY tag ORDER BY tag', [$id]);
        $colors = DB::select("SELECT attributes->>'color' AS value, count(*) AS count FROM products WHERE workspace_id = ? AND jsonb_exists(attributes, 'color') GROUP BY 1 ORDER BY 1", [$id]);
        $range = DB::selectOne('SELECT min(price)::text AS price_min, max(price)::text AS price_max, min(stock) AS stock_min, max(stock) AS stock_max FROM products WHERE workspace_id = ?', [$id]);
        $map = fn (array $rows) => array_map(fn ($r) => ['value' => $r->value, 'count' => (int) $r->count], $rows);

        return [
            'categories' => $map($categories),
            'tags' => $map($tags),
            'attribute_values' => ['color' => $map($colors)],
            'price' => ['min' => $range->price_min, 'max' => $range->price_max],
            'stock' => ['min' => $range->stock_min === null ? null : (int) $range->stock_min, 'max' => $range->stock_max === null ? null : (int) $range->stock_max],
            'sortable' => config('products.sortable'),
            'attribute_filters' => config('products.attributes'),
            'tags_match' => ['any', 'all'],
            'pagination' => ['default_per_page' => (int) config('products.pagination.default'), 'max_per_page' => (int) config('products.pagination.max')],
            'low_stock_threshold' => (int) config('products.low_stock_threshold'),
        ];
    }
}
