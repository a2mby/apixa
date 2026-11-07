# `@apixa/internal-shared` (private)

Framework-neutral helpers shared by Apixa framework integrations. **Never published.** Consumers
list it as a `devDependency` and their bundler inlines it; `pnpm check:architecture` fails if a
built file or declaration still names it.

| Module          | Contents                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------- |
| `keys.ts`       | `createResourceKeys`: hierarchical cache key algorithm (plain arrays)                                           |
| `operations.ts` | `describeOperations`, `assertNoFullResponse`, `BUILTIN_READ_NAMES`: operation classification from Core metadata |

**May import:** `@apixa/core` only. No React, Vue, Angular, TanStack, Mocking, or Node built-ins.
**Add code here only** when it is a pure algorithm that an existing integration already uses and a
second integration would reuse unchanged. Anything touching a query library's client or a framework
runtime stays in that integration. Tests: `tests/internal-shared/`.

See [architecture](../../../docs/architecture.md#architecture-contract-v100) and
[ADR 004](../../../docs/decisions/004-four-packages-and-private-shared-internals.md).
