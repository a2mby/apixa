<?php

// Product API limits. Every value can be overridden per environment or per test.
return [
    'pagination' => [
        'default' => (int) env('PRODUCTS_PER_PAGE', 15),
        'max' => (int) env('PRODUCTS_MAX_PER_PAGE', 100),
    ],

    // low stock means 0 < stock <= threshold; out of stock means stock = 0.
    'low_stock_threshold' => (int) env('PRODUCTS_LOW_STOCK_THRESHOLD', 5),

    // Largest `stock` the integer column can hold.
    'max_stock' => 2147483647,

    'bulk_max_items' => (int) env('PRODUCTS_BULK_MAX_ITEMS', 100),

    'import' => [
        'max_kilobytes' => (int) env('PRODUCTS_IMPORT_MAX_KB', 5120),
        'max_rows' => (int) env('PRODUCTS_IMPORT_MAX_ROWS', 5000),
        'rate_per_minute' => (int) env('PRODUCTS_IMPORT_RATE_PER_MINUTE', 30),
    ],

    'export' => [
        'chunk_size' => (int) env('PRODUCTS_EXPORT_CHUNK', 500),
        'preview_rows' => 5,
    ],

    'sortable' => ['name', 'price', 'stock', 'category', 'created_at', 'updated_at'],

    // Whitelisted JSONB attribute paths for `attr[path]=value` filters. Paths are never interpolated into SQL.
    'attributes' => [
        'color' => 'string',
        'dimensions.width' => 'number',
        'dimensions.height' => 'number',
        'variant' => 'string', // matches attributes.variants[].code
    ],
];
