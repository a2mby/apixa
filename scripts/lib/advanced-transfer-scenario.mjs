// Shared deterministic protocol execution against the packed module in every runtime.
export const ADVANCED_TRANSFER_SCENARIO = String.raw`
async function advancedTransferScenario(m, invoke = (api, body, options) => api.files.create(body, options)) {
  const parts = new Map(); let fail = true, created = 0, completed = 0, checkpoint;
  const transport = { async request(r) {
    const path = new URL(r.url).pathname;
    let body;
    if (r.method === 'POST' && path.endsWith('/start')) { created++; body = { id: 'session' }; }
    else if (r.method === 'GET') body = { parts: [...parts.values()].map(p => p.ack) };
    else if (r.method === 'PUT') {
      const index = Number(path.split('/').pop());
      if (index === 1 && fail) { fail = false; throw new m.NetworkError('simulated disconnection'); }
      const bytes = [...new Uint8Array(await new Response(r.body).arrayBuffer())];
      const ack = { index, offset: index * 3, size: bytes.length, verification: 'unverified' };
      parts.set(index, { bytes, ack }); body = ack;
    } else { completed++; body = { id: 'file', size: 8 }; }
    const raw = new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    return { status: 200, headers: raw.headers, raw, body };
  } };
  const config = { strategy: 'chunked', source: 'file', chunkSize: 3, concurrency: 2, protocol: {
    id: 'portable-parts', version: 1, independentParts: true, replaySafeParts: true, emptyFile: 'complete',
    initiate: (ctx) => ctx.request({ kind: 'write', method: 'POST', path: '/start' }),
    inspect: async (ctx) => ({ state: 'active', ...(await ctx.request({ kind: 'read', method: 'GET', path: '/status' })) }),
    uploadPart: (ctx, input) => ctx.request({ kind: 'write', method: 'PUT', path: '/parts/' + input.part.index, body: input.part.blob }),
    complete: (ctx) => ctx.request({ kind: 'write', method: 'POST', path: '/complete', full: true }),
  } };
  const make = () => m.defineApi({ baseURL: 'https://protocol.test', transport, resources: { files: { path: '/files', fileFields: ['file'], operations: { create: { transfer: config } } } } });
  const source = new Blob([new Uint8Array([0, 1, 2, 3, 4, 5, 6, 255])]);
  let interrupted = false;
  try { await invoke(make(), { file: source }, { transfer: { saveCheckpoint(c) { checkpoint = c; } } }); }
  catch (error) { interrupted = error instanceof m.NetworkError; }
  if (!interrupted || !checkpoint) throw Error('advanced interruption/checkpoint not observed');
  const copy = JSON.parse(JSON.stringify(checkpoint));
  const snapshots = [];
  const result = await invoke(make(), { file: source }, { transfer: { checkpoint: copy, onSession(s) { snapshots.push(s); } } });
  const bytes = [...parts.entries()].sort(([a], [b]) => a - b).flatMap(([, p]) => p.bytes);
  if (bytes.join() !== '0,1,2,3,4,5,6,255' || result.size !== 8 || created !== 1 || completed !== 1 || snapshots.at(-1).confirmedBytes !== 8) throw Error('advanced recovery bytes/ack/session invariants');
  return 'advanced:resumed:8';
}
`;
