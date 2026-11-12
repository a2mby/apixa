<?php

namespace App\Http\Controllers\Products;

use App\Http\Controllers\Controller;
use App\Http\Requests\Products\AdjustStockRequest;
use App\Http\Requests\Products\DuplicateProductRequest;
use App\Models\Product;
use App\Models\Workspace;
use App\Services\Products\InventoryService;
use App\Services\Products\ProductService;
use Illuminate\Http\JsonResponse;

class ProductInventoryController extends Controller
{
    public function __construct(private readonly InventoryService $inventory, private readonly ProductService $products) {}

    public function setStock(AdjustStockRequest $request, Workspace $workspace, Product $product): JsonResponse
    {
        return ProductController::respond($this->inventory->setStock($product, (int) $request->validated('stock'), $request->header('If-Match')));
    }

    public function adjustStock(AdjustStockRequest $request, Workspace $workspace, Product $product): JsonResponse
    {
        return ProductController::respond($this->inventory->adjustStock($product, (int) $request->validated('delta')));
    }

    public function setPrice(AdjustStockRequest $request, Workspace $workspace, Product $product): JsonResponse
    {
        return ProductController::respond($this->inventory->setPrice($product, $request->validated('price'), $request->header('If-Match')));
    }

    public function setActivation(AdjustStockRequest $request, Workspace $workspace, Product $product): JsonResponse
    {
        return ProductController::respond($this->inventory->setActive($product, $request->boolean('active'), $request->header('If-Match')));
    }

    public function duplicate(DuplicateProductRequest $request, Workspace $workspace, Product $product): JsonResponse
    {
        $copy = $this->products->duplicate($product, $request->validated());

        return ProductController::respond($copy, 201)->header('Location', route('products.show', [$workspace, $copy]));
    }
}
