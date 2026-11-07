# Install and choose an entry point

The prepared RC is `apixa@1.0.0-rc.0`; it has not yet been published. Once available:

```sh
npm install apixa
```

Use `defineApi`, `defineApis` and `defineMockApi` from `apixa`. The complete Core API is at
`apixa/core`. Core and Mocking do not require any framework dependency.

For React 18 or 19:

```sh
npm install apixa react @tanstack/react-query
```

Use hooks and `ApixaProvider` from `apixa/react`. React and TanStack Query v5 (>=5.90.1) are
optional peers and are not bundled into Apixa. Framework subpaths isolate dependencies so the
framework-independent root stays usable on its own. Vue and Angular integrations are planned only.

For server prefetch, construct a new `QueryClient` per request from `apixa/react/advanced`, then use
`prefetchResourceQuery` and `dehydrate`. Pass that state to `ApixaHydrationBoundary` from
`apixa/react`. See the [React guide](../../../packages/react/README.md) for full examples.

For named Core mocks, import `apixa/mocking/register` once before the first mocked call. This
registers the included loader without eagerly loading records. `defineMockApi` from `apixa`
uses the same engine and loads named records when requested. Import `users` directly from
`apixa/mocking/datasets/users` for one synthetic dataset, or use `loadDataset` from `apixa/mocking`
for a lazy catalog lookup. See the [Mocking guide](../../../packages/mocking/README.md).

Filesystem helpers live only at `apixa/mocking/node` and need Node.js >=22. Pass `{ basePath }`
to `loadDataset` or `listDatasets` to read your own directory of `meta.json` and `data.json` files.
Browser-safe entries contain bundled lazy records and do not import filesystem helpers.

There are no separate scoped packages to install. All public entry points and their types ship
inside the one `apixa` tarball; private workspace names are solely for repository development.
