import {
  runCrudErrorsReset,
  runCustomOperations,
  runDirectImport,
  runInline,
  runLazyLoad,
  runPaginationAndSlice,
  runStandalone,
} from "../../lib/mocking-demo";

/** Server-rendered mocking demo: every value below comes from `lib/mocking-demo.ts`. */
export const dynamic = "force-dynamic";

export default async function MockingPage() {
  const results = {
    inline: await runInline(),
    directImport: runDirectImport(),
    lazyLoad: await runLazyLoad(),
    paginationAndSlice: await runPaginationAndSlice(),
    crudErrorsReset: await runCrudErrorsReset(),
    customOperations: await runCustomOperations(),
    standalone: await runStandalone(),
  };
  return (
    <main>
      <h1>Mocking</h1>
      <pre>{JSON.stringify(results, null, 2)}</pre>
    </main>
  );
}
