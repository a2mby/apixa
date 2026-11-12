<?php

namespace App\Http\Requests\Products;

use App\Exceptions\ApiException;
use Illuminate\Foundation\Http\FormRequest;

class ImportProductsRequest extends FormRequest
{
    private const TYPES = [
        'csv' => ['text/csv', 'text/plain', 'application/csv', 'application/vnd.ms-excel', 'inode/x-empty'],
        'json' => ['application/json', 'text/plain', 'inode/x-empty'],
    ];

    public function authorize(): bool
    {
        return true;
    }

    /** Transport-level guards come first so they get their own status codes: 415 media type, 413 size. */
    protected function prepareForValidation(): void
    {
        $contentType = strtolower((string) $this->header('Content-Type'));
        if ($contentType !== '' && ! str_contains($contentType, 'multipart/form-data') && ! str_contains($contentType, 'x-www-form-urlencoded')) {
            throw new ApiException(415, 'unsupported_media_type', 'Send the import as multipart/form-data with a "file" part.');
        }
        $file = $this->file('file');
        if ($file === null) {
            return; // the rules report the missing part as 422
        }
        if (in_array($file->getError(), [UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE], true)) {
            throw new ApiException(413, 'payload_too_large', 'The uploaded file exceeds the maximum size.');
        }
        if (! $file->isValid()) {
            throw new ApiException(422, 'upload_failed', 'The file upload did not complete.', ['errors' => ['file' => ['The file upload did not complete.']]]);
        }
        $extension = strtolower($file->getClientOriginalExtension());
        if (! isset(self::TYPES[$extension]) || ! in_array($file->getMimeType(), self::TYPES[$extension], true)) {
            throw new ApiException(415, 'unsupported_media_type', 'Only .csv and .json files are supported.');
        }
        if (str_contains((string) file_get_contents($file->getRealPath(), false, null, 0, 8192), "\0")) {
            throw new ApiException(415, 'unsupported_media_type', 'The file is binary, not CSV or JSON text.');
        }
        if ($file->getSize() > config('products.import.max_kilobytes') * 1024) {
            throw new ApiException(413, 'payload_too_large', 'The file is larger than '.config('products.import.max_kilobytes').' KB.');
        }
    }

    public function rules(): array
    {
        return [
            'file' => ['required', 'file'],
            'mode' => ['sometimes', 'in:create,upsert'],
            'on_error' => ['sometimes', 'in:abort,skip'],
            'dry_run' => ['sometimes', 'boolean'],
        ];
    }

    public function fileFormat(): string
    {
        return strtolower($this->file('file')->getClientOriginalExtension());
    }
}
