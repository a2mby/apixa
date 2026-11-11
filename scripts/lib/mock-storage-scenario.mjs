import { ADVANCED_TRANSFER_SCENARIO } from "./advanced-transfer-scenario.mjs";
// The same packed-package workflow runs in Node, Chromium, Next SSR and both Edge runtimes.
export const MOCK_STORAGE_SCENARIO =
  ADVANCED_TRANSFER_SCENARIO +
  String.raw`
async function mockStorageScenario(m) {
  if (await advancedTransferScenario(m) !== "advanced:resumed:8") throw Error("advanced transfer cross-runtime scenario");
  const api = m.defineApi({ baseURL: 'https://mock.test', transport: { request() { throw Error('mock reached network'); } }, resources: {
    docs: { path: '/docs', fileFields: { file: { maxSize: 20, accept: ['text/plain'] } }, mock: {
      data: [{ id: 1, file: m.mockFixtureRef('seed') }],
      fixtures: { seed: m.mockFileFixture('seed', { name: 'seed.txt', type: 'text/plain', lastModified: 0 }) },
      storage: { disk: 'test', directory: 'docs', naming: 'unique' },
    }, operations: { download: { kind: 'read', method: 'GET', path: '/:id/file', responseType: 'text', mock: ({ params, store, files }) => files.get(store.get(Number(params.id)).file).blob() } } },
  } });
  const first = await api.docs.download(1);
  const old = (await api.docs.getById(1)).file;
  const updated = await api.docs.patch(1, { file: new Blob(['next'], { type: 'text/plain' }) });
  const next = await api.docs.download(1);
  if (!m.mockFiles(api).has(old) || m.mockFiles(api).list({ disk: 'test', path: 'docs' }).length !== 2) throw Error('fixture pin/path ownership');
  if (m.mockFiles(api).get(updated.file).meta.originalName !== 'blob') throw Error('stored naming');
  m.resetMock(api);
  if (m.mockFiles(api).size !== 0) throw Error('reset visibility');
  const reset = await api.docs.download(1);
  if (m.mockFiles(api).size !== 1) throw Error('fixture cleanup');
  return [first, next, reset].join(':');
}
`;
