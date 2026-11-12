<?php

namespace App\Http\Controllers\Products;

use App\Http\Controllers\Controller;
use App\Http\Requests\Products\ExportProductsRequest;
use App\Http\Requests\Products\ImportProductsRequest;
use App\Models\Workspace;
use App\Services\Products\ProductQueryService;
use App\Services\Products\ProductTransferService;
use Illuminate\Http\JsonResponse;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProductTransferController extends Controller
{
    private const TYPES = ['csv' => 'text/csv; charset=UTF-8', 'json' => 'application/json', 'ndjson' => 'application/x-ndjson'];

    public function __construct(private readonly ProductTransferService $transfers, private readonly ProductQueryService $queries) {}

    public function import(ImportProductsRequest $request, Workspace $workspace): JsonResponse
    {
        $summary = $this->transfers->import(
            $workspace,
            $request->file('file')->getRealPath(),
            $request->fileFormat(),
            (string) $request->input('mode', 'create'),
            (string) $request->input('on_error', 'abort'),
            $request->boolean('dry_run'),
        );

        return response()->json(['data' => $summary]);
    }

    public function export(ExportProductsRequest $request, Workspace $workspace): StreamedResponse
    {
        $format = (string) $request->query('format', 'csv');
        $filename = sprintf('products-%s-%s.%s', $workspace->getKey(), now()->format('Ymd-His'), $format);

        return response()->streamDownload(
            $this->transfers->stream($this->queries->query($workspace, $request), $format),
            $filename,
            ['Content-Type' => self::TYPES[$format], 'Cache-Control' => 'no-store', 'X-Accel-Buffering' => 'no'],
        );
    }

    public function preview(ExportProductsRequest $request, Workspace $workspace): JsonResponse
    {
        return response()->json(['data' => $this->transfers->preview(
            $this->queries->query($workspace, $request),
            (int) $request->query('limit', config('products.export.preview_rows')),
        )]);
    }
}
