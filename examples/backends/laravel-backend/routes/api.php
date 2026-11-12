<?php

use App\Http\Controllers\Products\ProductBulkController;
use App\Http\Controllers\Products\ProductCatalogController;
use App\Http\Controllers\Products\ProductController;
use App\Http\Controllers\Products\ProductInventoryController;
use App\Http\Controllers\Products\ProductTransferController;
use Illuminate\Support\Facades\Route;

// Product API. Full reference: docs/PRODUCT_API.md. Registered under /api.
// {product} is resolved through the workspace, so another workspace's product is a 404.
Route::prefix('workspaces/{workspace}/products')->name('products.')->scopeBindings()->group(function () {
    // Fixed paths first: they must win over the {product} wildcard below.
    Route::get('filters', [ProductCatalogController::class, 'filters'])->name('filters');
    Route::get('stats', [ProductCatalogController::class, 'stats'])->name('stats');
    Route::get('lookup', [ProductCatalogController::class, 'lookup'])->name('lookup');
    Route::get('low-stock', [ProductCatalogController::class, 'lowStock'])->name('low-stock');
    Route::get('out-of-stock', [ProductCatalogController::class, 'outOfStock'])->name('out-of-stock');

    Route::get('exports/preview', [ProductTransferController::class, 'preview'])->name('exports.preview');
    Route::get('exports', [ProductTransferController::class, 'export'])->name('exports');
    Route::post('imports', [ProductTransferController::class, 'import'])->middleware('throttle:product-imports')->name('imports');

    Route::post('bulk/updates', [ProductBulkController::class, 'updates'])->name('bulk.updates');
    Route::post('bulk/deletions', [ProductBulkController::class, 'deletions'])->name('bulk.deletions');
    Route::post('bulk/activation', [ProductBulkController::class, 'activation'])->name('bulk.activation');
    Route::post('bulk/price-adjustments', [ProductBulkController::class, 'priceAdjustments'])->name('bulk.prices');
    Route::post('bulk/stock-adjustments', [ProductBulkController::class, 'stockAdjustments'])->name('bulk.stock');

    Route::get('/', [ProductController::class, 'index'])->name('index');
    Route::post('/', [ProductController::class, 'store'])->name('store');
    Route::get('{product}', [ProductController::class, 'show'])->name('show');
    Route::put('{product}', [ProductController::class, 'replace'])->name('replace');
    Route::patch('{product}', [ProductController::class, 'update'])->name('update');
    Route::delete('{product}', [ProductController::class, 'destroy'])->name('destroy');

    Route::patch('{product}/stock', [ProductInventoryController::class, 'setStock'])->name('stock.set');
    Route::post('{product}/stock/adjustments', [ProductInventoryController::class, 'adjustStock'])->name('stock.adjust');
    Route::patch('{product}/price', [ProductInventoryController::class, 'setPrice'])->name('price.set');
    Route::patch('{product}/activation', [ProductInventoryController::class, 'setActivation'])->name('activation.set');
    Route::post('{product}/duplicate', [ProductInventoryController::class, 'duplicate'])->name('duplicate');
});
