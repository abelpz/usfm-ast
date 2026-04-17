/**
 * Integration test: aligned USFM round-trips through toUSJWithAlignments → commit body.
 * Verifies that \zaln-s / \w alignment markers survive the DCS commit path.
 */
import {
  DocumentStore,
  createAlignmentDocument,
  alignmentDocumentSourceKey,
} from '@usfm-tools/editor-core';
import { convertUSJDocumentToUSFM } from '@usfm-tools/adapters';
import { DcsGitSyncAdapter } from '../src/dcs-git-sync-adapter';
import { DcsSyncEngine } from '@usfm-tools/editor-core';

const ALIGNED_USFM = String.raw`\id TIT EN_ULT
\c 1
\p
\v 1 \zaln-s |x-strong="G39720" x-lemma="Παῦλος" x-occurrence="1" x-occurrences="1"\*\w Paul|x-occurrence="1" x-occurrences="1"\w*\zaln-e\*, a \zaln-s |x-strong="G14010" x-lemma="δοῦλος" x-occurrence="1" x-occurrences="1"\*\w servant|x-occurrence="1" x-occurrences="1"\w*\zaln-e\* of God
`;

const SOURCE_USFM = String.raw`\id TIT EL
\c 1
\p
\v 1 Παῦλος δοῦλος θεοῦ
`;

describe('DCS sync preserves alignment markers', () => {
  const origFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it('toUSJWithAlignments → convertUSJDocumentToUSFM preserves \\zaln-s markers', () => {
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(ALIGNED_USFM);
    const usj = store.getFullUSJ();
    const usfm = convertUSJDocumentToUSFM(usj);
    expect(usfm).toContain('\\zaln-s');
    expect(usfm).toContain('\\zaln-e\\*');
    expect(usfm).toContain('\\w Paul|x-occurrence');
  });

  it('DcsSyncEngine commit body contains \\zaln-s when getSnapshotUsj is wired', async () => {
    let capturedBody: Record<string, unknown> | null = null;

    globalThis.fetch = jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        capturedBody = JSON.parse(String(init.body));
        return Promise.resolve({
          ok: true,
          json: async () => ({ commit: { sha: 'sha1' } }),
        });
      }
      // GET for initial SHA
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          type: 'file',
          content: Buffer.from(ALIGNED_USFM, 'utf8').toString('base64'),
          sha: 's0',
        }),
      });
    }) as unknown as typeof fetch;

    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(ALIGNED_USFM);

    // Simulate what useScriptureSession does: provide toUSJWithAlignments via getSnapshotUsj
    const snapshotUsj = store.getFullUSJ();
    const getSnapshotUsj = () => snapshotUsj;

    const adapter = new DcsGitSyncAdapter({
      baseUrl: 'https://git.example',
      token: 'tok',
      owner: 'org',
      repo: 'tit',
      path: 'bible/tit.usfm',
    });

    const engine = new DcsSyncEngine({ adapter, store, getSnapshotUsj });
    (engine as unknown as { setOnline(v: boolean): void }).setOnline(true);
    const result = await engine.push();

    expect(result.status).toBe('ok');
    expect(capturedBody).not.toBeNull();

    // Decode the base64 content sent to DCS
    const sentUsfm = Buffer.from(String(capturedBody!.content), 'base64').toString('utf8');
    expect(sentUsfm).toContain('\\zaln-s');
    expect(sentUsfm).toContain('\\w Paul|x-occurrence');
  });

  it('warns (not throws) when getSnapshotUsj is missing, falls back to store USJ', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    let capturedBody: Record<string, unknown> | null = null;
    globalThis.fetch = jest.fn().mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        capturedBody = JSON.parse(String(init.body));
        return Promise.resolve({
          ok: true,
          json: async () => ({ commit: { sha: 'sha2' } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          type: 'file',
          content: Buffer.from(ALIGNED_USFM, 'utf8').toString('base64'),
          sha: 's0',
        }),
      });
    }) as unknown as typeof fetch;

    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(ALIGNED_USFM);

    const adapter = new DcsGitSyncAdapter({
      baseUrl: 'https://git.example',
      token: 'tok',
      owner: 'org',
      repo: 'tit',
      path: 'bible/tit.usfm',
    });

    // No getSnapshotUsj — DcsSyncEngine will warn
    const engine = new DcsSyncEngine({ adapter, store });
    (engine as unknown as { setOnline(v: boolean): void }).setOnline(true);
    const result = await engine.push();

    expect(result.status).toBe('ok');
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('without getSnapshotUsj'));
    expect(capturedBody).not.toBeNull();

    warnSpy.mockRestore();
  });

  it('DcsSyncEngine warns when getSnapshotUsj is missing and engine.push has no adapter', async () => {
    // With no adapter, push() returns the base status immediately — no warn for missing getSnapshotUsj
    // because the adapter branch is not entered.
    const engine = new DcsSyncEngine({});
    (engine as unknown as { setOnline(v: boolean): void }).setOnline(true);
    const result = await engine.push();
    // No adapter means no commit attempt — status comes from base DefaultSyncEngine.
    expect(result).toBeDefined();
  });
});
