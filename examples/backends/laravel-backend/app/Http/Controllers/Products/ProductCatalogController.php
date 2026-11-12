<?php

namespace App\Http\Controllers\Products;

use App\Http\Controllers\Controller;
use App\Http\Requests\Products\ListProductsRequest;
use App\Http\Resources\ProductResource;
use App\Models\Workspace;
use App\Services\Products\ProductQueryService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ProductCatalogController extends Controller
{
    public function __construct(private readonly ProductQueryService $queries) {}

    public function filters(Workspace $workspace): JsonResponse
    {
        return response()->json(['data' => $this->queries->filterOptions($workspace)]);
    }

    public function stats(Request $request, Workspace $workspace): JsonResponse
    {
        $request->validate(['threshold' => ['sometimes', 'integer', 'min:0', 'max:'.config('products.max_stock')]]);

        return response()->json(['data' => $this->queries->stats($workspace, (int) $request->query('threshold', config('products.low_stock_threshold')))]);
    }

    public function lookup(Request $request, Workspace $workspace): JsonResponse
    {
        $sku = $request->validate(['sku' => ['required', 'string', 'max:100']])['sku'];
        $product = $workspace->products()->where('sku', $sku)->firstOrFail();

        return ProductController::respond($product);
    }

    public function lowStock(ListProductsRequest $request, Workspace $workspace)
    {
        $request->merge(['low_stock' => true, 'low_stock_threshold' => (int) $request->query('threshold', config('products.low_stock_threshold'))]);

        return ProductResource::collection($this->queries->paginate($this->queries->query($workspace, $request), $request));
    }

    public function outOfStock(ListProductsRequest $request, Workspace $workspace)
    {
        $request->merge(['in_stock' => false]);

        return ProductResource::collection($this->queries->paginate($this->queries->query($workspace, $request), $request));
    }
}
