import type { TransferPartAck } from "apixa/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Small deterministic demonstration backend. Production applications supply their own protocol.
const sessions = new Map<
  string,
  { size: number; parts: Map<number, Uint8Array>; complete: boolean }
>();
const chunkSize = 4;
async function handle(request: Request, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  if (path[0] !== "sessions") return new Response(null, { status: 404 });
  if (request.method === "POST" && path.length === 1) {
    const { size } = await request.json();
    if (!Number.isSafeInteger(size) || size < 0 || size > 1024)
      return new Response(null, { status: 413 });
    // Bound the example server's metadata, too. Real storage persistence belongs to the backend.
    if (sessions.size >= 100) sessions.delete(sessions.keys().next().value!);
    const id = crypto.randomUUID();
    sessions.set(id, { size, parts: new Map(), complete: false });
    return Response.json({ id });
  }
  const session = sessions.get(path[1]!);
  if (!session) return new Response(null, { status: 404 });
  const acknowledgment = (index: number): TransferPartAck => ({
    index,
    offset: index * chunkSize,
    size: session.parts.get(index)!.length,
    verification: "unverified",
  });
  if (request.method === "GET")
    return Response.json({
      state: session.complete ? "completed" : "active",
      parts: [...session.parts.keys()].map(acknowledgment),
      result: { id: path[1], size: session.size },
    });
  if (request.method === "DELETE") {
    sessions.delete(path[1]!);
    return Response.json({ aborted: true });
  }
  if (path[2] === "parts" && request.method === "PUT") {
    const index = Number(path[3]);
    if (!Number.isSafeInteger(index) || index < 0 || index >= Math.ceil(session.size / chunkSize))
      return new Response(null, { status: 400 });
    if (Number(request.headers.get("content-length")) > chunkSize)
      return new Response(null, { status: 413 });
    const reader = request.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader)
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.length;
        if (size > chunkSize) {
          await reader.cancel();
          return new Response(null, { status: 413 });
        }
        chunks.push(result.value);
      }
    if (size !== Math.min(chunkSize, session.size - index * chunkSize))
      return new Response(null, { status: 400 });
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    session.parts.set(index, bytes);
    return Response.json(acknowledgment(index));
  }
  if (request.method === "POST" && path[2] === "complete") {
    const count = Math.ceil(session.size / chunkSize);
    if (session.parts.size !== count) return new Response(null, { status: 409 });
    session.complete = true;
    return Response.json({ id: path[1], size: session.size });
  }
  return new Response(null, { status: 405 });
}
export { handle as GET, handle as POST, handle as PUT, handle as DELETE };
