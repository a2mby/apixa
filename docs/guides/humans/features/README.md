# Feature guides

These describe implemented behavior. Package READMEs hold the long examples; these pages say when to use a feature and where the limits are.

| Guide                                                     | When to read it                                                                            |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [Schemas and `ApiState`](./schemas.md)                    | You validate bodies, queries, or responses, use `apixa/validation`, or migrate state types |
| [Pagination](./pagination.md)                             | You choose a strategy, map an envelope, or walk pages                                      |
| [Production file handling](./production-file-handling.md) | You ship uploads, downloads, or transfers and need guarantees, limits, and recovery        |
| [Custom operations](./custom-operations.md)               | A backend route is not one of the 13 built-ins                                             |
| [Mocking](./mocking.md)                                   | You want in-memory data instead of a network call                                          |
| [Errors](./errors.md)                                     | You need to tell HTTP failures, validation, and configuration mistakes apart               |

The full operation table and configuration rules are in [conventions](../../../conventions.md).
