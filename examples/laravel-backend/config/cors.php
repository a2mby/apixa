<?php

return [
    'paths' => ['api', 'api/*'],
    'allowed_methods' => ['*'],
    // Only explicit origins are accepted, including when credentials are enabled.
    'allowed_origins' => array_values(array_filter(
        array_map('trim', explode(',', (string) env('CORS_ALLOWED_ORIGINS', ''))),
        fn (string $origin): bool => $origin !== '' && $origin !== '*',
    )),
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => env('CORS_SUPPORTS_CREDENTIALS', false),
];
