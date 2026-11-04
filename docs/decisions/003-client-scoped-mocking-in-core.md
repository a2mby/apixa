# 003 — Client-scoped mocking runs inside Core's execution layer

Status: accepted (#58)

## Context

Resource mocking used to be activated by global processors (`registerDefineApiProcessor`,
`@apixa/mocking/register`). A lazily loaded selective transport matched requests to stores by
URL pathname. This had several problems:

- Creating one mocked client changed how later, unrelated clients were built.
- Base-URL prefixes such as `/v1` broke matching.
- Overridden or custom paths could fall through to the live network.
- `defineMockApi()` kept a second engine whose semantics differed (`getMany`, `exists`,
  `findFirst`).
- Only 6 of the 15 advertised dataset IDs resolved at runtime.

## Decision

- The in-memory engine (`MockStore`) lives in Core (`packages/core/src/mock/`). It has no
  dataset records and no dependencies.
- A resource's `mock` value is the data source: a dataset ID, an inline array, a provider, or
  `{ data, idKey, seed }`. When the client is built, that resource is bound to its own store.
- Each operation is resolved once. At call time it runs through one pipeline, and step 6
  dispatches to HTTP or to the store according to the resource's configuration. URLs are never
  used for this choice.
- Mocked builtins run their own store operation. Custom `ctx.request()` and declarative custom
  operations are routed by method and resource-relative path. Anything the engine cannot
  simulate throws `MOCK_UNSUPPORTED`. A mocked resource never reaches a transport.
- Dataset IDs and entity types are Core types (`MockDatasetCatalog`). Records stay in
  `@apixa/mocking` and load one dataset at a time through `@apixa/mocking/datasets`, an optional
  peer that Core imports dynamically.
- `defineMockApi()` is a thin adapter over the same `MockStore`.

## Consequences

- No global registration, no setup call, and no initialization-order effects. Each client's
  stores are isolated and reset with `resetMock()`.
- This replaces the earlier convention "do not couple mocking to production request
  execution". The coupling is now an explicit execution branch in one pipeline, not a hidden
  transport swap.
- Core's unminified ESM bundle grew from about 37 KB to about 70 KB (engine, validation,
  transforms). No dataset JSON is bundled into Core.
