# v3.0.0 — Acceptance criteria

Only check a criterion when implementation and verification evidence exist.

## Core correctness

- [x] Slice uses JavaScript semantics; slice with pagination fails configuration validation.
- [x] Invalid collection shapes produce typed diagnostic errors; valid empty results remain valid.
- [x] Request middleware query changes agree across transport, mocks, URLs and metadata.

## Definitions and requests

- [x] Decisions 5–14 are implemented consistently at runtime and in consumer types.
- [x] Decisions 15–21 are implemented and covered for nested, empty, binary and invalid values.

## Responses and pagination

- [x] Decisions 22–27 are implemented in one response pipeline, including source preservation.
- [x] Decisions 28–31 are implemented with explicit list pagination and live/mock parity.

## Consumers and release

- [x] All affected public types, React integrations, maintained examples and packed consumers migrate.
- [x] Advanced transfers, streaming, browser, SSR, Edge and optional dependency behavior remain covered.
- [x] README, reference, configuration, operations, middleware, pagination, changelog and migration guide match the implemented API.
- [ ] Full verification, publish dry run, reproducible real HTTP checks and Node 22/24 CI pass.
- [ ] Release candidate is ready; no npm publication has occurred.
