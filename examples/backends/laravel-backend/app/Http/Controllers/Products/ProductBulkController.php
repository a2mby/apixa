<?php

namespace App\Http\Controllers\Products;

use App\Http\Controllers\Controller;
use App\Http\Requests\Products\BulkIdsRequest;
use App\Http\Requests\Products\BulkStockAdjustmentRequest;
use App\Http\Requests\Products\BulkUpdateRequest;
use App\Models\Workspace;
use App\Services\Products\ProductBulkService;
use Illuminate\Http\JsonResponse;

class ProductBulkController extends Controller
{
    public function __construct(private readonly ProductBulkService $bulk) {}

    public function updates(BulkUpdateRequest $request, Workspace $workspace): JsonResponse
    {
        return response()->json($this->bulk->update($workspace, $request->items(), $request->transaction()));
    }

    public function deletions(BulkIdsRequest $request, Workspace $workspace): JsonResponse
    {
        return response()->json($this->bulk->delete($workspace, $request->validated('ids'), $request->transaction()));
    }

    public function activation(BulkIdsRequest $request, Workspace $workspace): JsonResponse
    {
        return response()->json($this->bulk->activate($workspace, $request->validated('ids'), $request->boolean('active'), $request->transaction()));
    }

    public function priceAdjustments(BulkIdsRequest $request, Workspace $workspace): JsonResponse
    {
        $v = $request->validated();

        return response()->json($this->bulk->adjustPrices($workspace, $v['ids'], $v['operation'], (string) $v['value'], $request->transaction()));
    }

    public function stockAdjustments(BulkStockAdjustmentRequest $request, Workspace $workspace): JsonResponse
    {
        return response()->json($this->bulk->adjustStock($workspace, $request->validated('items'), $request->transaction()));
    }
}
