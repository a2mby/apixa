# v1.1.0 — Context

Frozen milestone context. Living project context: [`docs/context.md`](../../docs/context.md).

## Goal

Advanced File Handling, first release: native `File` / `Blob` values inside the existing resource
operations, a documented serialization engine, and a minimal in-memory file store for mocked
resources.

> Common workflows work without configuration; unusual backend requirements stay configurable.

```ts
type User = { id: string; name: string; avatar: string; documents: string[] };

const api = defineApi<{ users: { path: "/users"; entity: User } }>()({
  baseURL: "https://api.example.com",
  resources: { users: { path: "/users", fileFields: ["avatar", "documents"] } },
});

const user = await api.users.getById("1"); // user.avatar: string, user.documents: string[]
await api.users.create({ name: "Ada", avatar: file, documents: [a, b] }); // multipart, no bodyFormat
await api.users.update("1", { name: "Ada L." }); // no binary values → JSON, as before
```

## Identity (this release)

- One published package: `apixa`. Version bump and release are **not** part of this milestone.
- Private modular implementations touched: `packages/core` (types, serializer, pipeline, mock
  engine, errors), `packages/mocking` (public re-export of the mock file API), `packages/react`
  (type verification only). No new packages, no new runtime dependencies.
- Baseline: `apixa@1.0.0-rc.0` (the only published 1.0.0 build; v1.0.0 is not declared stable).

## Principles that bind this release

1. Files live **inside** existing operations — one entity type, no parallel upload client.
2. Types derive from the entity: names are checked, reads keep `string` / `string[]`, eligible
   writes accept `File | Blob` (and arrays); optionality, `null` and explicit body overrides survive.
3. JSON is the normal format. Multipart is chosen **automatically** when the request body contains
   binary values; `dataFormat` overrides per operation. Binary values are never JSON-stringified.
4. Multipart rules are documented and deterministic: bracket notation for nested objects and
   ordinary arrays, repeated field names for file lists, `undefined` omitted, explicit `null`
   handling, aliases and JSON-encoded fields as overrides.
5. The runtime owns multipart `Content-Type`; the transport generates the boundary.
6. Bodies owned by the caller are never mutated; key transforms never touch binary values.
7. Mocked resources store real bytes in a virtual in-memory file store, separate from dataset
   records, and return string references from reads. Failed operations leave no partial state.
8. New failures use Apixa's error hierarchy and never include binary data or request contents.
9. Core stays free of React, TanStack Query, React Hook Form and Mocking; Fetch stays in Core.
10. Planned ≠ implemented: docs and examples show implemented API only.

## Intentionally out

Downloads and binary responses, progress APIs, streaming bodies, chunked / resumable / parallel
uploads, storage-provider adapters, file-level validation limits (size, MIME), a React Hook Form
adapter, file lifecycle policies. Laravel is a conceptual inspiration only; no PHP conventions.
See [scope.md](./scope.md) and the roadmap in [`docs/roadmap.md`](../../docs/roadmap.md).
