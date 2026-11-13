import { AdvancedTransfers } from "./advanced-transfers";
import { ApixaHydrationBoundary } from "@apixa/react";
import { QueryClient, dehydrate, prefetchResourceQuery } from "@apixa/react/advanced";
import { filesApi } from "../../lib/files-demo";
import { FilesDemo } from "./files-demo";

export const dynamic = "force-dynamic";

export default async function Page() {
  // Serializable data (the list) is prefetched and hydrated as usual.
  const client = new QueryClient();
  await prefetchResourceQuery(client, filesApi.files, { queryKey: ["files"] });
  // Binary data stays on the server: a Blob cannot cross the Server -> Client boundary, so the
  // Server Component reads it and passes only plain values (a number) down.
  const blob = await filesApi.files.download({ params: { id: "1" } });
  return (
    <ApixaHydrationBoundary state={dehydrate(client)}>
      <main>
        <h1>Files</h1>
        <p data-testid="server-bytes">server downloaded {blob.size} bytes</p>
        <FilesDemo />
        <AdvancedTransfers />
      </main>
    </ApixaHydrationBoundary>
  );
}
