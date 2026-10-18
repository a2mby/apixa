# Dataset build scripts

```bash
pnpm datasets:build
```

Runs [`build-collection.mjs`](./build-collection.mjs): downloads eligible fixed-source JSON into a local cache, writes `datasets/<domain>/<id>/`, regenerates synthetics with seed `230523`, and updates `datasets/manifest.json` + `ATTRIBUTION.md`.

Cache: `scripts/datasets/.cache/` (gitignored).
