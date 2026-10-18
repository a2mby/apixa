# v0.5.0 — Implementation plan

Smallest path to local Simple Mocking + backend removal. Prefer a thin `@apixa/mocking` package over stuffing mocks into Core.

## Design decisions to lock while coding

1. **Package boundary:** `@apixa/mocking` owns datasets helpers, registry, and mock `Transport`. Core only exposes injectable `Transport` (already shipped).
2. **Dataset layout:** Choose **one** home — recommend `datasets/<id>/` at repo root with `meta.json` + `data.json` (or `.jsonl`). Package reads via configured base path / import.
3. **Metadata fields (minimum):** `id`, `title`, `description?`, `license`, `version`, `resource` (path hint), `records` (count or derived), `schema` (lightweight JSON description or field list).
4. **Routing:** Map HTTP method + path (from Core’s transport request) onto dataset operations for builtins (`GET` collection → list, `GET …/:id` → one, `POST` → create-in-memory optional or fixture-only read path — lock read-first if write mocks are too large).
5. **First slice preference:** **Read-path mocking** (`getAll` / `getByID`) from static JSON; document write ops as follow-up if needed to stay minimal.
6. **No website.** Catalog = filesystem + docs table listing sample datasets.
7. **Backend removal** happens in the same milestone after mocks work in the Next example (or in parallel once mock transport exists).

## Ordered steps

### 1. Freeze contract pointers (this kickoff) — done

- `versions/README.md`, `docs/context.md` banner, `docs/roadmap.md`, `docs/story.md` kickoff

### 2. Scaffold `@apixa/mocking` — done

- Workspace package, depends on `@apixa/core` types / `Transport`
- Export public API; wire `pnpm` workspace

### 3. Dataset format + sample — done

- Root `datasets/users-sample/` + `meta.json` / `data.json`
- Documented in package README + `datasets/README.md`

### 4. Registry + load — done

- `listDatasets` / `loadDataset(id)` from local disk (Node-friendly; browser imports JSON)

### 5. Mock transport — done

- `createMockTransport({ dataset | datasets })` implementing `Transport`
- Builtin CRUD (read + in-memory write); tests with fixtures

### 6. Next example — done

- Mock transport + dataset JSON; no FastAPI URL

### 7. Remove backend — done

- Deleted `backend/` and backend scripts; updated scripts/README, root README, `.gitignore`

### 8. Docs + acceptance — done

- CHANGELOG, context/architecture notes, story completion, acceptance boxes

## File touch list (expected)

| Path                                        | Change                       |
| ------------------------------------------- | ---------------------------- |
| `packages/mocking/**`                       | New package                  |
| `datasets/**` or under mocking              | Sample datasets + meta       |
| `pnpm-workspace.yaml` / lockfile            | Include package              |
| `examples/next/lib/*`                       | Mock transport usage (local) |
| `backend/**`                                | Delete                       |
| `scripts/**/run-backend*` etc.              | Delete or retarget           |
| `tests/mocking/**` or `tests/core` adjacent | Registry + transport tests   |
| `docs/*`, `README.md`, `CHANGELOG.md`       | Document                     |

## Non-steps

- Do not build a website or hosted catalog.
- Do not add `mocks` to Core `defineApi` config.
- Do not implement abort/retries/middleware product API here.
- Do not rewrite frozen v0.1–v0.4 feature intent.
- Do not add TanStack Query into Core.
