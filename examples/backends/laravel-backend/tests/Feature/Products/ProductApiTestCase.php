<?php

namespace Tests\Feature\Products;

use App\Models\Product;
use Database\Seeders\RelationalPlaygroundSeeder;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Tests\TestCase;

/** Real HTTP kernel + real PostgreSQL testing database; every test runs in a rolled-back transaction. */
abstract class ProductApiTestCase extends TestCase
{
    use DatabaseTransactions;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RelationalPlaygroundSeeder::class); // restores the baseline fixtures inside the test transaction
    }

    protected function url(string $path = '', string $workspace = 'ws-1'): string
    {
        return "/api/workspaces/$workspace/products".($path === '' ? '' : "/$path");
    }

    /** @param  array<string, mixed>  $overrides */
    protected function valid(array $overrides = []): array
    {
        static $n = 0;
        $n++;

        return $overrides + ['name' => "Test product $n", 'sku' => "TST-$n-".bin2hex(random_bytes(3)), 'category' => 'office', 'price' => '12.50', 'stock' => 10, 'active' => true, 'tags' => ['sale'], 'attributes' => ['color' => 'red']];
    }

    protected function make(array $overrides = [], string $workspace = 'ws-1'): Product
    {
        $id = $this->postJson($this->url('', $workspace), $this->valid($overrides))->assertCreated()->json('data.id');

        return Product::findOrFail($id);
    }
}
