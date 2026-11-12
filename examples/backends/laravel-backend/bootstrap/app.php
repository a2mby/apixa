<?php

use App\Exceptions\ApiException;
use App\Http\Middleware\RejectMalformedJson;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\PostTooLargeException;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        apiPrefix: 'api',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->api(prepend: [RejectMalformedJson::class]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );

        // One error body for every API failure: { message, code, [errors], [...] }.
        // Stack traces, SQL and file paths never reach a public response, even with APP_DEBUG=true.
        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api/*')) {
                return null;
            }
            if ($e instanceof ApiException) {
                return $e->render();
            }
            if ($e instanceof ValidationException) {
                return response()->json(['message' => $e->getMessage(), 'code' => 'validation_failed', 'errors' => $e->errors()], 422);
            }
            if ($e instanceof ModelNotFoundException || $e instanceof NotFoundHttpException) {
                return response()->json(['message' => 'Resource not found.', 'code' => 'not_found'], 404);
            }
            if ($e instanceof PostTooLargeException) {
                return response()->json(['message' => 'The request body is too large.', 'code' => 'payload_too_large'], 413);
            }
            if ($e instanceof HttpExceptionInterface) {
                $status = $e->getStatusCode();
                $code = match ($status) {
                    405 => 'method_not_allowed',
                    429 => 'too_many_requests',
                    default => 'http_error',
                };

                return response()->json(['message' => $status === 429 ? 'Too many requests.' : ($e->getMessage() ?: 'Request failed.'), 'code' => $code], $status, $e->getHeaders());
            }

            return response()->json(['message' => 'Server error.', 'code' => 'server_error'], 500);
        });
    })->create();
