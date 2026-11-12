---
description: Only edit the Next.js examples; leave other examples alone
globs: examples/**/*
alwaysApply: true
---

# Examples — Next only

The maintained Next.js apps are **`examples/frontends/query-ssr-next`** (tracked and driven by `pnpm verify`: this is where scenarios that must stay maintained live) and the local, untracked playground **`examples/frontends/next`** (ignored by git). Do not create, edit, delete, or “sync” other example apps unless the user explicitly names that framework.

## Allowed

- `examples/frontends/query-ssr-next/**` (tracked; its README when documenting Next usage)
- `examples/frontends/next/**` (local playground; not committed)
- Root docs / README that _mention_ examples in general

## Do not touch

- `examples/frontends/basic`
- `examples/frontends/react-vite`
- `examples/frontends/vue`
- `examples/frontends/vanilla`
- `examples/frontends/angular`
- `examples/frontends/react-native`
- Any new `examples/<framework>/` folder

```text
# ❌ BAD — drive-by updates across playgrounds
examples/frontends/vue/src/api.ts
examples/frontends/react-vite/src/api.ts

# ✅ GOOD — Next only
examples/frontends/query-ssr-next/lib/api.ts
examples/frontends/query-ssr-next/app/files/...
```

If an API change needs a usage sample and Next is not enough, update Core tests / README first. Only open another example when the user asks for that example by name.
