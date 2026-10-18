# `@apixa/mocking`

Local JSON datasets and a mock `Transport` for Apixa.

Mocking is **not** part of Core’s production request path. You inject a transport into `defineApi({ transport })`.

## Dataset layout

Repo root (version-controlled), domain folders:

```text
datasets/
  manifest.json
  ATTRIBUTION.md
  <domain>/<id>/
    meta.json
    data.json
```

`meta.json` minimum fields: `id`, `title`, `license`, `version`, `resource.path`, `schema.fields`, `records`.

Rebuild from fixed sources (see issue #23): `pnpm datasets:build`.

## Usage (Node)

```ts
import { defineApi } from "@apixa/core";
import { createMockTransport } from "@apixa/mocking";
import { loadDataset } from "@apixa/mocking/node";

const dataset = await loadDataset("users-sample");
const api = defineApi({
  baseURL: "https://mock.local",
  transport: createMockTransport({ dataset }),
  users: { path: "/users" },
});

await api.users.getAll();
```

`listDatasets()` (from `@apixa/mocking/node`) lists local folders; no network.

## Browser / Next

Import JSON (or an already-loaded `Dataset`) and use the **browser-safe** entry — do **not** import `@apixa/mocking/node` in client bundles:

```ts
import data from "../../../datasets/users/users-sample/data.json";
import meta from "../../../datasets/users/users-sample/meta.json";
import { createMockTransport } from "@apixa/mocking";

createMockTransport({ dataset: { meta, records: data } });
```

## Future online catalog

A hosted browse/download catalog is **planned** only. This package stays local-first.
