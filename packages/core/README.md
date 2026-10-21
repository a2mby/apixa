# `@apixa/core`

TypeScript API client: `defineApi()`, default-first resource CRUD, Fetch transport, standardized errors.

## Request reliability

### Cancel and timeout

Pass `signal` and/or `timeout` on any operation call (`RequestOptions`). Precedence: **call → operation → resource → api**.

| Outcome                     | Error          |
| --------------------------- | -------------- |
| Caller aborts `AbortSignal` | `AbortError`   |
| Configured timeout elapses  | `TimeoutError` |

```ts
const controller = new AbortController();
await api.users.getByID("1", { signal: controller.signal, timeout: 5_000 });
controller.abort();
```

### Retries (opt-in)

Root `retry` (optional overrides on resource / operation; `false` disables):

| Field         | Default                       |
| ------------- | ----------------------------- |
| `retries`     | required when `retry` is set  |
| `methods`     | `["GET", "HEAD"]`             |
| `statusCodes` | `408`, `429`, and `500`–`599` |
| `baseDelayMs` | `200`                         |
| `maxDelayMs`  | `2000`                        |
| `jitter`      | `true`                        |

Retries also apply to `NetworkError` and `TimeoutError`. **Never** after `AbortError`. Backoff is exponential (`baseDelayMs * 2^attempt`), capped, optionally jittered.

### Middleware

Ordered `middleware` on `defineApi`. Each hook runs **once per logical call** and wraps the full retry loop:

```ts
import type { Middleware } from "@apixa/core";

const withTrace: Middleware = async (ctx, next) => {
  ctx.request.headers.set("X-Trace", "1");
  return next();
};
```

Mutate `ctx.request` before `next()`. This is not a full auth or logging product.

## Notes

- Operations return native `Promise<T>` (response body unwrapped).
- No React / Next / TanStack Query dependencies.
- Mocking lives in optional peer `@apixa/mocking` — not on the production hot path.
