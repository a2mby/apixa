# v1.8.1 — Scope

## In scope

| Area          | Included work                                                                                                                                                                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Laravel       | Official stable Laravel 13 skeleton, Composer lock, standard directories/bootstrap/default model and migrations; remove optional Node scaffolding and automatic SQLite migration hooks |
| PostgreSQL    | Standard driver/config, external native service, independently provisionable `apixa_laravel_dev`, `apixa_laravel_test`, `apixa_laravel_e2e`; non-destructive identity checks           |
| Routing       | Empty `routes/api.php`, `/api` prefix, native API middleware and skeleton JSON exception rendering; retain default welcome and `/up`                                                   |
| CORS          | Built-in middleware with environment-driven exact origins and optional credentials; no wildcard origins                                                                                |
| Storage       | Standard private local and public disks; writable runtime directories; disable private disk's automatic serving routes                                                                 |
| Environments  | Four secret-free examples; PHPUnit PostgreSQL selection; native `--env` commands; multi-worker local serving; production reference only                                                |
| Documentation | Backend README, one root discovery link, milestone contract/pointers/story and honest verification evidence                                                                            |
| Verification  | Real PostgreSQL/default migrations/storage/HTTP/preflight/environment isolation, default Laravel tests, unchanged `pnpm verify` and npm package exclusion                              |

## Out of scope

| Item                                                                                    | Reason                                               |
| --------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Application endpoints, controllers, new models, business logic, validation, auth        | Author-owned future behavior                         |
| SDK imports/integrations or changes to `packages/`, `src/`, exports or package versions | Environment only                                     |
| New Node workspace/package or PHP dependencies outside Laravel                          | Independent Composer project                         |
| Custom loaders, middleware, CLI wrappers, application migrations, seeds or fixtures     | Use framework defaults                               |
| Browser frontend, Playwright installation/scenarios, concurrency simulation             | Later author-authored scenarios                      |
| Docker, Redis, background workers, deployment stack                                     | Native local services; production configuration only |
| Automatic destructive resets or production database changes                             | Explicit selection required for any manual reset     |
| Changes to other examples or frozen milestones                                          | Preserve existing work                               |

No root package manifest, workspace configuration or Node CI change is planned.
