<?php

/**
 * Concurrency test worker. Runs as a separate OS process (its own PostgreSQL connection), waits for a shared start
 * time, then sends requests through the real HTTP kernel. Usage: php http_worker.php '<json spec>'
 * spec: {"start": <unix float>, "requests": [{"method","uri","body","headers"}]}; prints a JSON list of results.
 */

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;

require __DIR__.'/../../vendor/autoload.php';

$spec = json_decode($argv[1], true);
$app = require __DIR__.'/../../bootstrap/app.php';
$kernel = $app->make(Kernel::class);

while (microtime(true) < $spec['start']) {
    usleep(200);
}

$results = [];
foreach ($spec['requests'] as $r) {
    $server = ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'];
    foreach ($r['headers'] ?? [] as $name => $value) {
        $server['HTTP_'.strtoupper(str_replace('-', '_', $name))] = $value;
    }
    $request = Request::create($r['uri'], $r['method'], [], [], [], $server, isset($r['body']) ? json_encode($r['body']) : null);
    $response = $kernel->handle($request);
    $results[] = ['status' => $response->getStatusCode(), 'body' => json_decode($response->getContent(), true)];
    $kernel->terminate($request, $response);
}

echo json_encode($results);
