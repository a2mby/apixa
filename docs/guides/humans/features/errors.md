# Errors

Status: **implemented**. These classes are exported from `apixa` and `apixa/core`. The export list is in [public-api.md](../../../public-api.md). Catch the class that matches the failure instead of reading an error message.

| You hit                                                       | Class                                            | Typical cause                                                                               |
| ------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| The definition is rejected while the client is created        | `ConfigError`                                    | Unknown key, illegal `pagination` placement, unknown `responseType`                         |
| The HTTP call completed with an error status                  | `HttpError`                                      | The backend rejected the request. `isHttpError` narrows it                                  |
| The call never got a response                                 | `NetworkError`                                   | DNS, connection, or a transport failure before a status                                     |
| The call exceeded its budget                                  | `TimeoutError`                                   | `timeout` elapsed. `isTimeoutError` narrows it                                              |
| The caller aborted                                            | `AbortError`                                     | `signal` aborted the call                                                                   |
| JSON or the query string could not be encoded                 | `SerializationError`                             | Circular query values, non-finite numbers, or depth over 64                                 |
| Key conversion failed                                         | `TransformError`                                 | `transforms` hit a cycle, a depth limit, or colliding keys                                  |
| The body, query, response, or HTTP error body failed a schema | `SchemaValidationError`                          | `schema` rejected the value. `phase` is `"body"`, `"query"`, `"response"`, or `"error"`     |
| A built-in received the wrong JSON shape                      | `ResponseShapeError`                             | For example `getAll` expected an array, or a page envelope was incomplete                   |
| A path parameter or file rule failed                          | `ValidationError`                                | Missing `options.params`, or a file constraint                                              |
| A URL left the allowed origin                                 | `SecurityError`                                  | A redirect or path targeted another origin                                                  |
| The mock store rejected the call                              | `MockError`, `MockApiError`, `InvalidSliceError` | Bad mock data, a mock failure, or an invalid `slice`. `isMockError` narrows the mock family |

`isApiError` matches the shared `ApiError` family. File and transfer failures may also set `ApiError.transfer` or `ApiError.advancedTransfer`. What Apixa will and will not recover is in [Production file handling](./production-file-handling.md).
