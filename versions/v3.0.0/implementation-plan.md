# v3.0.0 — Implementation plan

Umbrella: [#112](https://github.com/a2mby/apixa/issues/112). Keep each milestone independently
testable, add behavioral regression tests before each confirmed fix, and preserve user-owned work.

## Ordered steps

1. [#113](https://github.com/a2mby/apixa/issues/113): establish regression tests and fix slice,
   invalid collection handling and request middleware query correctness.
2. [#114](https://github.com/a2mby/apixa/issues/114): consolidate operation selection,
   declarations, calls, middleware, identities and type inference.
3. [#117](https://github.com/a2mby/apixa/issues/117): unify query and body serialization.
4. [#116](https://github.com/a2mby/apixa/issues/116): build the response processing pipeline,
   explicit unwrapping, validation, safe key transforms and source preservation.
5. [#118](https://github.com/a2mby/apixa/issues/118): unify pagination and mocks; keep slicing
   strictly client-side.
6. [#115](https://github.com/a2mby/apixa/issues/115): migrate integrations, maintained examples
   and consumers; complete migration and reference documentation; verify the release candidate.

## Design boundaries

- Query array format and custom query serialization remain client-wide.
- Function operations declare kind; declarative HTTP operations derive kind from method.
- `params`, `query` and bodies have stable, separate positions in operation calls.
- Unwrapping, validation and pagination are configured; no implicit envelope guessing.
- Preserve transport response, parsed source, processed data and validation result as distinct stages.
- No schema dependency, publication, backend compensation or additional package.

## Expected touch areas

`packages/core/src/{api,operation,request,http,transport,transform,types,errors,mock}/`,
`packages/mocking/src/`, `packages/internal/shared/src/`, `packages/react/src/`, `src/`,
`tests/`, `scripts/`, `examples/frontends/query-ssr-next/`, `README.md`, living docs and this
milestone. Each tracked task records its narrower file and test list.
