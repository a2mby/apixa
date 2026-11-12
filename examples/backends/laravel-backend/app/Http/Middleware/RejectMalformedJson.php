<?php

namespace App\Http\Middleware;

use App\Exceptions\ApiException;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** A JSON request with an unparsable body is a 400, not a silently empty payload that fails with 422. */
class RejectMalformedJson
{
    public function handle(Request $request, Closure $next): Response
    {
        $body = $request->getContent();
        if ($request->isJson() && $body !== '' && ! $request->isMethodSafe()) {
            json_decode($body);
            if (json_last_error() !== JSON_ERROR_NONE) {
                throw new ApiException(400, 'malformed_json', 'The request body is not valid JSON.');
            }
        }

        return $next($request);
    }
}
