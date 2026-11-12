<?php

namespace App\Http\Controllers\Products;

use App\Http\Controllers\Controller;
use App\Http\Requests\Products\ListProductsRequest;
use App\Http\Requests\Products\StoreProductRequest;
use App\Http\Requests\Products\UpdateProductRequest;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Models\Workspace;
use App\Services\Products\ProductQueryService;
use App\Services\Products\ProductService;
use App\Support\ProductEtag;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ProductController extends Controller
{
    public function __construct(private readonly ProductService $products, private readonly ProductQueryService $queries) {}

    public function index(ListProductsRequest $request, Workspace $workspace)
    {
        return ProductResource::collection($this->queries->paginate($this->queries->query($workspace, $request), $request));
    }

    public function show(Workspace $workspace, Product $product): JsonResponse
    {
        return self::respond($product);
    }

    public function store(StoreProductRequest $request, Workspace $workspace): JsonResponse
    {
        $product = $this->products->create($workspace, $request->payload());

        return self::respond($product, 201)->header('Location', route('products.show', [$workspace, $product]));
    }

    /** PUT replaces all editable fields; omitted tags/attributes become empty. */
    public function replace(UpdateProductRequest $request, Workspace $workspace, Product $product): JsonResponse
    {
        $data = $request->payload() + ['tags' => [], 'attributes' => (object) []];

        return self::respond($this->products->update($product, $data, $request->header('If-Match')));
    }

    /** PATCH changes only the fields sent; `attributes`, when sent, replaces the whole attributes object. */
    public function update(UpdateProductRequest $request, Workspace $workspace, Product $product): JsonResponse
    {
        return self::respond($this->products->update($product, $request->payload(), $request->header('If-Match')));
    }

    public function destroy(Request $request, Workspace $workspace, Product $product): Response
    {
        $this->products->delete($product, $request->header('If-Match'));

        return response()->noContent();
    }

    public static function respond(Product $product, int $status = 200): JsonResponse
    {
        return (new ProductResource($product))->response()->setStatusCode($status)->header('ETag', ProductEtag::for($product));
    }
}
