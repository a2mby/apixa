# v3.0.0 — Scope

## In scope

| Area                  | Work                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Correctness           | Fix slice overflow, reject slice with pagination, reject invalid collection shapes and apply middleware query mutations consistently.                                                               |
| Definitions and calls | One operation selector and declaration model; derive HTTP kinds; one middleware syntax; consistent typed call options; typed identity and lookup; remove redundant builtins and deprecated aliases. |
| Requests              | Structured queries and configurable empty values, client-wide query formats, correct encoding, raw and JSON strings, safe body serialization and typed errors.                                      |
| Responses             | Strict JSON and explicit automatic parsing, inherited unwrapping, builtin structural contracts, generic validation hooks, bounded/excluded key transforms, and parsed source preservation.          |
| Pagination            | Opt-in list-operation pagination, consistent preset expansion and common live/mock contracts; slice remains client-side.                                                                            |
| Integrations          | Migrate Core, Mocking, React, the public facade, maintained Next example and packed consumers; retain advanced transfers and optional integrations.                                                 |
| Release preparation   | Documentation, v2-to-v3 migration guide, changelog, release metadata, regression/type/real HTTP checks, full verification and Node 22/24 CI.                                                        |

## Out of scope

| Area                                            | Reason                                                                 |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| npm publication                                 | The owner requested a verified release candidate, not publication.     |
| New framework or transport packages             | Preserve existing package boundaries and framework-independent Core.   |
| Required schema library or Zod adapter          | Generic validation hooks are in scope; schema adapters are later work. |
| Unrelated examples or backend changes           | Keep the maintained Next consumer and backend behavior intact.         |
| Hidden compatibility layers and backend guesses | v3 is a coordinated breaking release with explicit conventions.        |
