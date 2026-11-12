# API-first compatibility

**Why it exists:** Keeps the API contract and server as the authority for data, validation, and errors; the frontend is a client.
**Use when:** introducing or changing API consumption, validation ownership, errors, pagination, auth, or contract mocks.
**Do not use when:** the change is purely presentational or touches no exchanged data.

The API contract is the source of truth for exchanged data. The frontend is its client; the API owns business rules. Frontend-only interaction rules (selection, drafts, undo presentation) remain with their UI owner.

## Rules

1. **Contract before UI.** Request/response types or schemas exist in OpenAPI, shared schemas, or generated types before components consume them. Inspect the authoritative contract; never guess response shapes. If the endpoint is unavailable, mark the proposed contract and use checked mocks rather than claiming a live integration.
2. **One typed API client per capability.** All HTTP goes through that interface; components/hooks never call `fetch`/axios directly. Reuse the established transport. Separate server/browser entries only when credentials or runtime imports require it; share contract, parsing, and error behavior rather than duplicating them.
3. **Validate at the boundary.** Parse untrusted responses once, including realtime payloads. Map to app models only when the external shape differs from UI needs. Type assertions and generated TypeScript alone are not runtime validation.
4. **Business rules live in the API.** Frontend validation is UX feedback aligned with server rules. Surface server field/global validation failures. Prefer server-provided limits or shared schema for portable constraints; do not reimplement authorization, eligibility, inventory, or persistence rules in Next.js.
5. **Errors are contract data.** Use one normalized shape containing status, code, message, and field errors. Map transport/schema failures once. Reuse the established wire format and map internally; do not change a server contract just to match this example.
6. **Versioning and compatibility.** Existing endpoints get additive changes; breaking changes require a new version or the API's explicit compatibility mechanism. Tolerate unknown fields, handle missing optional fields, and reject malformed required fields. Decide an unknown-enum fallback rather than crashing the entire view.
7. **No backend leakage.** UI models do not depend on database names/internal enums. Map exposed internal representations at the client boundary. Request a suitable endpoint instead of stitching five calls in a component; while it is unavailable, keep necessary coordination in one feature loader with explicit partial-failure handling.
8. **Pagination/filtering/sorting** belong to the API for large or paged datasets; send parameters. Exception: a complete bounded dataset already in memory supports local display filtering without claiming server-wide completeness.
9. **Auth** lives at the client/transport boundary: attach credentials, coordinate refresh, and handle 401 once. Browser navigation belongs in its adapter; server code returns/throws its environment's auth outcome. Refresh once per in-flight failure group; avoid loops. Keep 403 permission failures distinct.
10. **Mocking.** If the API is not ready, use MSW or the repo's equivalent against the contract. Generate mocks or validate their request/response fixtures with the same schema; cover success, empty, validation, permission, timeout, and malformed data. Label mocks as mocks.

## Default data flow

```text
UI component -> feature hook/query -> typed API client -> API (source of truth)
                     |
              single cache owner (query cache or server component fetch)
```

For a Server Component read, the route/feature loader takes the hook's place. A simple POST form calls its local typed client directly from the submit owner; no empty query hook is needed.

## Boundary error example

Illustrative internal model, not a new wire protocol:

```ts
interface ApiFailure {
  status: number | null; // null for transport failure before a response
  code: string;
  message: string;
  fieldErrors?: Record<string, string[]>;
  requestId?: string;
}
```

Map non-JSON error bodies, aborts, and schema failures at the transport boundary. User-facing messages must not expose raw upstream exceptions or secrets. A returned failure is distinct from a valid empty list.

## Validation placement decision

| Validation                                        | Authority                                | Frontend placement                                         |
| ------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------- |
| Required input, length, immediate format feedback | Server contract; frontend mirrors for UX | Colocated form schema                                      |
| Untrusted response shape                          | API contract                             | Typed client's parser, once                                |
| Eligibility, authorization, booking availability  | API/domain service                       | Show server result; refresh affected read after submission |
| Editor selection/undo interaction invariants      | Owning UI module                         | Private module function/reducer                            |

In A Square, ASquare-System is authoritative; Express is the BFF and Next.js is the rendering/client boundary. Use `@a-square/contracts` for cross-app contracts, but verify the actual exported shape first. Existing parsers and form schemas are evidence to inspect, not a substitute for System's contract.

Tradeoff: API-first ownership solves frontend/backend drift; costs contract coordination, parsing, and mock maintenance. Avoid a mapping layer when wire and UI shapes already match, or network calls for purely local UI rules. Misuse creates a second backend in actions, unverifiable mock shapes, or diverging browser/server clients.
