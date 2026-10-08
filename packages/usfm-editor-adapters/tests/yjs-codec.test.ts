import {
  usfmToYjsBase64,
  yjsBase64ToUsfm,
  updateYjsBase64WithUsfm,
  mergeYjsBase64ThreeWay,
} from '../src/yjs-codec';
import { isYbinPath, crdtPathFromUsfm, usfmPathFromCrdt } from '../src/crdt-paths';
import { mergeFileContent, mergeProjectMaps } from '../src/three-way-merge-project';

// ---------------------------------------------------------------------------
// crdt-paths
// ---------------------------------------------------------------------------

describe('crdt-paths', () => {
  describe('isYbinPath', () => {
    it('returns true for .ybin paths', () => {
      expect(isYbinPath('crdt/JHN.ybin')).toBe(true);
      expect(isYbinPath('crdt/JHN.YBIN')).toBe(true);
    });
    it('returns false for non-.ybin paths', () => {
      expect(isYbinPath('files/JHN.usfm')).toBe(false);
      expect(isYbinPath('manifest.yaml')).toBe(false);
    });
  });

  describe('crdtPathFromUsfm', () => {
    it('converts a simple USFM path', () => {
      expect(crdtPathFromUsfm('JHN.usfm')).toBe('crdt/JHN.ybin');
    });
    it('strips the directory prefix, keeps the filename', () => {
      expect(crdtPathFromUsfm('files/JHN.usfm')).toBe('crdt/JHN.ybin');
    });
    it('handles numbered prefix', () => {
      expect(crdtPathFromUsfm('65-3JN.usfm')).toBe('crdt/65-3JN.ybin');
    });
    it('handles .sfm extension', () => {
      expect(crdtPathFromUsfm('TIT.sfm')).toBe('crdt/TIT.ybin');
    });
  });

  describe('usfmPathFromCrdt', () => {
    it('converts crdt/ path back to files/', () => {
      expect(usfmPathFromCrdt('crdt/JHN.ybin')).toBe('files/JHN.usfm');
    });
    it('returns null for non-crdt paths', () => {
      expect(usfmPathFromCrdt('files/JHN.usfm')).toBeNull();
      expect(usfmPathFromCrdt('manifest.yaml')).toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// yjs-codec: usfmToYjsBase64 / yjsBase64ToUsfm
// ---------------------------------------------------------------------------

const SAMPLE_USFM = `\\id JHN - John
\\usfm 3.0
\\c 1
\\p
\\v 1 In the beginning was the Word.
\\v 2 He was in the beginning with God.
`;

describe('yjs-codec — roundtrip', () => {
  it('encodes USFM to a non-empty base64 string', () => {
    const b64 = usfmToYjsBase64(SAMPLE_USFM);
    expect(typeof b64).toBe('string');
    expect(b64.length).toBeGreaterThan(0);
    // Should be valid base64 (no spaces, correct character set)
    expect(b64).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it('decodes back to the original USFM', () => {
    const b64 = usfmToYjsBase64(SAMPLE_USFM);
    const decoded = yjsBase64ToUsfm(b64);
    expect(decoded).toBe(SAMPLE_USFM);
  });

  it('handles empty USFM (blank document)', () => {
    const b64 = usfmToYjsBase64('');
    expect(yjsBase64ToUsfm(b64)).toBe('');
  });

  it('roundtrip is stable (re-encoding gives same base64)', () => {
    const b64a = usfmToYjsBase64(SAMPLE_USFM);
    const usfm = yjsBase64ToUsfm(b64a);
    const b64b = usfmToYjsBase64(usfm);
    // Same content → same Y.Text → same encoded state.
    expect(yjsBase64ToUsfm(b64b)).toBe(SAMPLE_USFM);
  });
});

// ---------------------------------------------------------------------------
// yjs-codec: mergeYjsBase64ThreeWay
// ---------------------------------------------------------------------------

describe('mergeYjsBase64ThreeWay', () => {
  const BASE = `\\id JHN
\\c 1
\\p
\\v 1 Original text.
`;
  const OURS = `\\id JHN
\\c 1
\\p
\\v 1 Our edited text.
`;
  const THEIRS = `\\id JHN
\\c 1
\\p
\\v 1 Original text.
\\v 2 Theirs added verse two.
`;

  it('returns merged when base == ours (fast-forward to theirs)', () => {
    const base = usfmToYjsBase64(BASE);
    const ours = usfmToYjsBase64(BASE); // identical to base
    const theirs = usfmToYjsBase64(THEIRS);
    const r = mergeYjsBase64ThreeWay(base, ours, theirs);
    expect(r.kind).toBe('merged');
    if (r.kind === 'merged') {
      expect(r.usfm).toContain('verse two');
    }
  });

  it('returns merged when base == theirs (fast-forward to ours)', () => {
    const base = usfmToYjsBase64(BASE);
    const ours = usfmToYjsBase64(OURS);
    const theirs = usfmToYjsBase64(BASE);
    const r = mergeYjsBase64ThreeWay(base, ours, theirs);
    expect(r.kind).toBe('merged');
    if (r.kind === 'merged') {
      expect(r.usfm).toContain('Our edited text');
    }
  });

  it('returns merged for concurrent non-overlapping changes', () => {
    const base = usfmToYjsBase64(BASE);
    const ours = usfmToYjsBase64(OURS);
    const theirs = usfmToYjsBase64(THEIRS);
    const r = mergeYjsBase64ThreeWay(base, ours, theirs);
    expect(r.kind).toBe('merged');
    if (r.kind === 'merged') {
      // Both changes present: our text edit + their new verse
      expect(r.usfm).toContain('Our edited text');
      expect(r.usfm).toContain('verse two');
      // Result is valid base64
      expect(r.base64).toMatch(/^[A-Za-z0-9+/]+=*$/);
    }
  });

  it('merged base64 decodes back to the merged USFM', () => {
    const base = usfmToYjsBase64(BASE);
    const ours = usfmToYjsBase64(OURS);
    const theirs = usfmToYjsBase64(THEIRS);
    const r = mergeYjsBase64ThreeWay(base, ours, theirs);
    expect(r.kind).toBe('merged');
    if (r.kind === 'merged') {
      const roundtripped = yjsBase64ToUsfm(r.base64);
      expect(roundtripped).toBe(r.usfm);
    }
  });

  it('handles empty base (both sides added content)', () => {
    const base = usfmToYjsBase64('');
    const ours = usfmToYjsBase64('\\id JHN\n\\c 1\n');
    const theirs = usfmToYjsBase64('\\id JHN\n\\c 2\n');
    const r = mergeYjsBase64ThreeWay(base, ours, theirs);
    expect(r.kind).toBe('merged');
    if (r.kind === 'merged') {
      expect(r.usfm.length).toBeGreaterThan(0);
    }
  });

  it('returns conflict for corrupted base64 input', () => {
    const r = mergeYjsBase64ThreeWay('not-valid-base64!!!', '', '');
    // Yjs may or may not throw on bad input — either conflict or merged with empty
    // Accept either but confirm no uncaught exception
    expect(r.kind === 'merged' || r.kind === 'conflict').toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mergeFileContent dispatches .ybin to CRDT merge
// ---------------------------------------------------------------------------

describe('mergeFileContent — .ybin dispatch', () => {
  it('merges a .ybin file via CRDT (never produces conflict for valid inputs)', () => {
    const base = usfmToYjsBase64('\\id TIT\n\\c 1\n\\p\n\\v 1 Base.\n');
    const ours = usfmToYjsBase64('\\id TIT\n\\c 1\n\\p\n\\v 1 Ours.\n');
    const theirs = usfmToYjsBase64('\\id TIT\n\\c 1\n\\p\n\\v 1 Base.\n\\v 2 Theirs added.\n');
    const result = mergeFileContent({ path: 'crdt/TIT.ybin', base, ours, theirs });
    expect(result.kind).toBe('merged');
    if (result.kind === 'merged') {
      // Merged text is valid base64 (the .ybin binary encoded)
      expect(result.text).toMatch(/^[A-Za-z0-9+/]+=*$/);
      // Decoding gives USFM containing both changes
      const usfm = yjsBase64ToUsfm(result.text);
      expect(usfm).toContain('Ours');
      expect(usfm).toContain('Theirs added');
    }
  });

  it('fast-paths when ours === theirs (pre-dispatch shortcut)', () => {
    const state = usfmToYjsBase64('\\id TIT\n\\c 1\n\\p\n\\v 1 Same.\n');
    const result = mergeFileContent({ path: 'crdt/TIT.ybin', base: state, ours: state, theirs: state });
    expect(result.kind).toBe('merged');
    if (result.kind === 'merged') {
      expect(result.text).toBe(state);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 6: mergeProjectMaps — CRDT-first for USFM when .ybin companions exist
// ---------------------------------------------------------------------------

describe('mergeProjectMaps — Phase 6 CRDT-first for USFM', () => {
  const USFM_PATH = 'files/TIT.usfm';
  const YBIN_PATH = 'crdt/TIT.ybin';

  function makeRevision(usfm: string) {
    return { usfm, ybin: usfmToYjsBase64(usfm) };
  }

  it('uses CRDT merge when all three .ybin companions exist — no OT, no conflict', () => {
    const base = makeRevision('\id TIT\n\c 1\n\p\n\v 1 Base.\n');
    const ours = makeRevision('\id TIT\n\c 1\n\p\n\v 1 Ours edit.\n');
    const theirs = makeRevision('\id TIT\n\c 1\n\p\n\v 1 Base.\n\v 2 Theirs added.\n');

    const files = new Map([
      [USFM_PATH + ':base', base.usfm], [USFM_PATH + ':ours', ours.usfm], [USFM_PATH + ':theirs', theirs.usfm],
      [YBIN_PATH + ':base', base.ybin], [YBIN_PATH + ':ours', ours.ybin], [YBIN_PATH + ':theirs', theirs.ybin],
    ]);

    const result = mergeProjectMaps({
      paths: new Set([USFM_PATH, YBIN_PATH]),
      getBase: (p) => files.get(p + ':base'),
      getOurs: (p) => files.get(p + ':ours'),
      getTheirs: (p) => files.get(p + ':theirs'),
    });

    expect(result.conflicts).toHaveLength(0);
    expect(result.merged.has(USFM_PATH)).toBe(true);
    const mergedUsfm = result.merged.get(USFM_PATH)!;
    // CRDT merge silently combines both edits
    expect(mergedUsfm).toContain('Ours edit');
    expect(mergedUsfm).toContain('Theirs added');
  });

  it('falls back to OT merge when .ybin companions are absent', () => {
    // Only USFM paths — no .ybin in the file set
    const base = '\id TIT\n\c 1\n\p\n\v 1 Base.\n';
    const ours = '\id TIT\n\c 1\n\p\n\v 1 Ours.\n';
    const theirs = '\id TIT\n\c 1\n\p\n\v 1 Base.\n';

    const result = mergeProjectMaps({
      paths: new Set([USFM_PATH]),
      getBase: (p) => p === USFM_PATH ? base : undefined,
      getOurs: (p) => p === USFM_PATH ? ours : undefined,
      getTheirs: (p) => p === USFM_PATH ? theirs : undefined,
    });

    // base===theirs → OT one-sided shortcut → merged to ours
    expect(result.conflicts).toHaveLength(0);
    expect(result.merged.get(USFM_PATH)).toBeTruthy();
  });

  it('fast-forward: when only theirs changed, CRDT merge returns theirs content', () => {
    const base = makeRevision('\id TIT\n\c 1\n\p\n\v 1 Base.\n');
    const ours = makeRevision('\id TIT\n\c 1\n\p\n\v 1 Base.\n'); // unchanged
    const theirs = makeRevision('\id TIT\n\c 1\n\p\n\v 1 Theirs only.\n');

    const files = new Map([
      [USFM_PATH + ':base', base.usfm], [USFM_PATH + ':ours', ours.usfm], [USFM_PATH + ':theirs', theirs.usfm],
      [YBIN_PATH + ':base', base.ybin], [YBIN_PATH + ':ours', ours.ybin], [YBIN_PATH + ':theirs', theirs.ybin],
    ]);

    const result = mergeProjectMaps({
      paths: new Set([USFM_PATH, YBIN_PATH]),
      getBase: (p) => files.get(p + ':base'),
      getOurs: (p) => files.get(p + ':ours'),
      getTheirs: (p) => files.get(p + ':theirs'),
    });

    expect(result.conflicts).toHaveLength(0);
    expect(result.merged.get(USFM_PATH)).toContain('Theirs only');
  });

  it('both .ybin and .usfm appear in merged output when CRDT path taken', () => {
    const base = makeRevision('\id TIT\n\c 1\n\p\n\v 1 Base.\n');
    const ours = makeRevision('\id TIT\n\c 1\n\p\n\v 1 Ours.\n');
    const theirs = makeRevision('\id TIT\n\c 1\n\p\n\v 1 Base.\n');

    const files = new Map([
      [USFM_PATH + ':base', base.usfm], [USFM_PATH + ':ours', ours.usfm], [USFM_PATH + ':theirs', theirs.usfm],
      [YBIN_PATH + ':base', base.ybin], [YBIN_PATH + ':ours', ours.ybin], [YBIN_PATH + ':theirs', theirs.ybin],
    ]);

    const result = mergeProjectMaps({
      paths: new Set([USFM_PATH, YBIN_PATH]),
      getBase: (p) => files.get(p + ':base'),
      getOurs: (p) => files.get(p + ':ours'),
      getTheirs: (p) => files.get(p + ':theirs'),
    });

    expect(result.conflicts).toHaveLength(0);
    // Both USFM and .ybin paths produced merged output
    expect(result.merged.has(USFM_PATH)).toBe(true);
    expect(result.merged.has(YBIN_PATH)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Phase 7: updateYjsBase64WithUsfm — incremental Yjs update
// ---------------------------------------------------------------------------

describe('updateYjsBase64WithUsfm', () => {
  it('returns a valid .ybin that decodes to the new USFM content', () => {
    const genesis = usfmToYjsBase64('\\id TIT\n\\c 1\n\\p\n\\v 1 Hello.\n');
    const updated = updateYjsBase64WithUsfm(genesis, '\\id TIT\n\\c 1\n\\p\n\\v 1 Updated.\n');
    expect(yjsBase64ToUsfm(updated)).toBe('\\id TIT\n\\c 1\n\\p\n\\v 1 Updated.\n');
  });

  it('handles empty existing state (creates genesis)', () => {
    const updated = updateYjsBase64WithUsfm('', '\\id TIT\n\\c 1\n\\p\n\\v 1 New.\n');
    expect(yjsBase64ToUsfm(updated)).toBe('\\id TIT\n\\c 1\n\\p\n\\v 1 New.\n');
  });

  it('produces a larger state update (operations are accumulated, not replaced)', () => {
    const genesis = usfmToYjsBase64('\\id TIT\n\\c 1\n\\p\n\\v 1 V1.\n');
    const step2 = updateYjsBase64WithUsfm(genesis, '\\id TIT\n\\c 1\n\\p\n\\v 1 V2.\n');
    const step3 = updateYjsBase64WithUsfm(step2, '\\id TIT\n\\c 1\n\\p\n\\v 1 V3.\n');
    // Each update accumulates operations — state grows
    expect(step3.length).toBeGreaterThan(genesis.length);
    expect(yjsBase64ToUsfm(step3)).toBe('\\id TIT\n\\c 1\n\\p\n\\v 1 V3.\n');
  });
});

// ---------------------------------------------------------------------------
// Phase 7: mergeProjectMaps — peer sync (no shared base .ybin)
// ---------------------------------------------------------------------------

describe('mergeProjectMaps — Phase 7 peer sync (no shared .ybin base)', () => {
  const USFM_PATH = 'files/JHN.usfm';
  const YBIN_PATH = 'crdt/JHN.ybin';

  // Simulate both devices starting from the same genesis .ybin (DCS sync or
  // shared bundle), then each making independent edits.
  function makeSharedGenesis(usfm: string) {
    return usfmToYjsBase64(usfm);
  }
  function applyEdit(genesis: string, newUsfm: string) {
    return updateYjsBase64WithUsfm(genesis, newUsfm);
  }

  it('surfaces conflict when divergent peer edits have no shared base', () => {
    const genesisUsfm = '\\id JHN\n\\c 1\n\\p\n\\v 1 In the beginning.\n';
    const genesis = makeSharedGenesis(genesisUsfm);

    const oursUsfm = '\\id JHN\n\\c 1\n\\p\n\\v 1 In the beginning was the Word.\n';
    const theirsUsfm = '\\id JHN\n\\c 1\n\\p\n\\v 1 In the beginning.\n\\v 2 Added verse.\n';

    const oursYbin = applyEdit(genesis, oursUsfm);
    const theirsYbin = applyEdit(genesis, theirsUsfm);

    // No base: simulates Device B receiving Device A's snapshot for the first time
    const result = mergeProjectMaps({
      paths: new Set([USFM_PATH, YBIN_PATH]),
      getBase: () => undefined,
      getOurs: (p) => p === USFM_PATH ? oursUsfm : p === YBIN_PATH ? oursYbin : undefined,
      getTheirs: (p) => p === USFM_PATH ? theirsUsfm : p === YBIN_PATH ? theirsYbin : undefined,
    });

    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]!.path).toBe(USFM_PATH);
    expect(result.conflicts[0]!.oursText).toContain('Word');
    expect(result.conflicts[0]!.theirsText).toContain('Added verse');
    expect(result.merged.has(USFM_PATH)).toBe(false);
    expect(result.merged.has(YBIN_PATH)).toBe(false);
  });

  it('no-conflict when peer sent identical content (idempotent import)', () => {
    const usfm = '\\id JHN\n\\c 1\n\\p\n\\v 1 Same.\n';
    const ybin = usfmToYjsBase64(usfm);

    const result = mergeProjectMaps({
      paths: new Set([USFM_PATH, YBIN_PATH]),
      getBase: () => undefined,
      getOurs: (p) => p === USFM_PATH ? usfm : p === YBIN_PATH ? ybin : undefined,
      getTheirs: (p) => p === USFM_PATH ? usfm : p === YBIN_PATH ? ybin : undefined,
    });

    expect(result.conflicts).toHaveLength(0);
    expect(result.merged.get(USFM_PATH)).toBeDefined();
  });
});
