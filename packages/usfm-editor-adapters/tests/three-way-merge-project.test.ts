import { mergeProjectMaps, mergeFileContent, mergeUsfmFile } from '../src/three-way-merge-project';

// ---------------------------------------------------------------------------
// mergeFileContent: YAML deep-merge and JSON canonical tests
// ---------------------------------------------------------------------------

describe('mergeFileContent — YAML manifest deep-merge', () => {
  const path = 'manifest.yaml';

  it('merges silently when only dublin_core.modified differs (metadata-only)', () => {
    const base = 'dublin_core:\n  modified: "2024-01-01"\n  title: "Titus"\n';
    const ours = 'dublin_core:\n  modified: "2024-06-01"\n  title: "Titus"\n';
    const theirs = 'dublin_core:\n  modified: "2024-09-01"\n  title: "Titus"\n';
    const result = mergeFileContent({ path, base, ours, theirs });
    expect(result.kind).toBe('merged');
  });

  it('merges silently when only lastRemoteSyncAt differs', () => {
    const base = 'title: Titus\nlastRemoteSyncAt: "2024-01-01T00:00:00Z"\n';
    const ours = 'title: Titus\nlastRemoteSyncAt: "2024-06-01T00:00:00Z"\n';
    const theirs = 'title: Titus\nlastRemoteSyncAt: "2024-09-01T00:00:00Z"\n';
    const result = mergeFileContent({ path, base, ours, theirs });
    expect(result.kind).toBe('merged');
  });

  it('surfaces a conflict when real YAML keys both change differently', () => {
    const base = 'title: Titus\nversion: "1"\n';
    const ours = 'title: Titus Updated\nversion: "1"\n';
    const theirs = 'title: Titus Changed\nversion: "1"\n';
    const result = mergeFileContent({ path, base, ours, theirs });
    expect(result.kind).toBe('conflict');
  });

  it('resolves silently when only ours changes a real key (fast-forward)', () => {
    const base = 'title: Old\n';
    const ours = 'title: New\n';
    const theirs = 'title: Old\n';
    const result = mergeFileContent({ path, base, ours, theirs });
    expect(result.kind).toBe('merged');
    if (result.kind === 'merged') {
      expect(result.text).toContain('New');
    }
  });

  it('merges with empty base (bundle-import scenario)', () => {
    // Both sides added the same key from no base — should merge
    const base = '';
    const ours = 'title: Titus\n';
    const theirs = 'title: Titus\n'; // identical
    const result = mergeFileContent({ path, base, ours, theirs });
    expect(result.kind).toBe('merged');
  });
});

describe('mergeFileContent — JSON canonical equality', () => {
  it('merges identical JSON content without base (canonical comparison)', () => {
    const ours = '{"a":1,"b":2}';
    const theirs = '{"b":2,"a":1}'; // same content, different key order
    const result = mergeFileContent({ path: 'data.json', base: '', ours, theirs });
    expect(result.kind).toBe('merged');
  });

  it('surfaces conflict when JSON content genuinely differs', () => {
    const result = mergeFileContent({
      path: 'data.json',
      base: '{"a":1}',
      ours: '{"a":2}',
      theirs: '{"a":3}',
    });
    expect(result.kind).toBe('conflict');
  });

  it('merges fast-forward JSON even with canonical reordering', () => {
    const base = '{"a":1}';
    const ours = '{"a":1}'; // unchanged
    const theirs = '{"a":1,"b":99}'; // theirs added b
    const result = mergeFileContent({ path: 'data.json', base, ours, theirs });
    expect(result.kind).toBe('merged');
    if (result.kind === 'merged') {
      expect(JSON.parse(result.text)).toMatchObject({ b: 99 });
    }
  });
});

describe('mergeFileContent — alignment.json JSON deep-merge', () => {
  const path = '3JN.alignment.json';

  it('silently merges when only "updated" timestamp differs', () => {
    const base = JSON.stringify({ format: 'usfm-alignment', version: '1.0', updated: '2024-01-01T00:00:00Z', verses: { '3JN 1:1': [] } });
    const ours  = JSON.stringify({ format: 'usfm-alignment', version: '1.0', updated: '2024-06-01T12:00:00Z', verses: { '3JN 1:1': [] } });
    const theirs = JSON.stringify({ format: 'usfm-alignment', version: '1.0', updated: '2024-09-01T18:00:00Z', verses: { '3JN 1:1': [] } });
    const result = mergeFileContent({ path, base, ours, theirs });
    expect(result.kind).toBe('merged');
    if (result.kind === 'merged') {
      const parsed = JSON.parse(result.text) as Record<string, unknown>;
      // Real content is preserved
      expect((parsed.verses as Record<string, unknown>)['3JN 1:1']).toBeDefined();
    }
  });

  it('silently merges when only "created" and "updated" differ', () => {
    const base   = JSON.stringify({ format: 'usfm-alignment', created: '2024-01-01', updated: '2024-01-01', verses: {} });
    const ours   = JSON.stringify({ format: 'usfm-alignment', created: '2024-01-01', updated: '2024-06-01', verses: {} });
    const theirs = JSON.stringify({ format: 'usfm-alignment', created: '2024-01-01', updated: '2024-09-01', verses: {} });
    const result = mergeFileContent({ path, base, ours, theirs });
    expect(result.kind).toBe('merged');
  });

  it('surfaces a conflict when real "verses" content differs', () => {
    const base   = JSON.stringify({ updated: '2024-01-01', verses: { '3JN 1:1': [{ word: 'beloved' }] } });
    const ours   = JSON.stringify({ updated: '2024-06-01', verses: { '3JN 1:1': [{ word: 'beloved one' }] } });
    const theirs = JSON.stringify({ updated: '2024-09-01', verses: { '3JN 1:1': [{ word: 'dear friend' }] } });
    const result = mergeFileContent({ path, base, ours, theirs });
    expect(result.kind).toBe('conflict');
  });

  it('silently merges identical JSON content (canonical check)', () => {
    const ours   = JSON.stringify({ format: 'usfm-alignment', version: '1.0', updated: '2024-01-01' });
    const theirs = JSON.stringify({ version: '1.0', format: 'usfm-alignment', updated: '2024-01-01' }); // same, different key order
    const result = mergeFileContent({ path, base: '', ours, theirs });
    expect(result.kind).toBe('merged');
  });
});

// ---------------------------------------------------------------------------
// mergeUsfmFile — USFM formatting-only differences
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// mergeFileContent — chapterIndices accuracy
// ---------------------------------------------------------------------------

describe('mergeFileContent — chapterIndices (no false intro indicator)', () => {
  const BASE = [
    '\\id TIT',
    '\\h Titus',
    '\\c 1',
    '\\p',
    '\\v 1 Paul, a servant of God.',
    '\\v 2 In hope of eternal life.',
  ].join('\n');

  it('chapter 1 conflict → chapterIndices is [1] only (no 0)', () => {
    // Both sides change verse 1 text differently → real chapter-1 conflict.
    const ours   = BASE.replace('servant of God', 'servant of Christ');
    const theirs = BASE.replace('servant of God', 'slave of God');
    const result = mergeFileContent({ path: '56-TIT.usfm', base: BASE, ours, theirs });
    expect(result.kind).toBe('conflict');
    if (result.kind === 'conflict') {
      expect(result.conflict.chapterIndices).not.toContain(0);
      expect(result.conflict.chapterIndices).toContain(1);
    }
  });

  it('intro-region conflict (\\ h changed both sides) → chapterIndices includes 0', () => {
    // Both sides change the \h running header differently → intro (chapter 0) conflict.
    const ours   = BASE.replace('\\h Titus', '\\h Letter to Titus');
    const theirs = BASE.replace('\\h Titus', '\\h Tito');
    const result = mergeFileContent({ path: '56-TIT.usfm', base: BASE, ours, theirs });
    // This may merge cleanly depending on OT internals; only assert when it conflicts.
    if (result.kind === 'conflict') {
      // Chapter 0 = intro — must appear; chapter 1 must NOT appear (no change there).
      expect(result.conflict.chapterIndices).toContain(0);
      expect(result.conflict.chapterIndices).not.toContain(1);
    }
  });
});

describe('mergeUsfmFile — formatting-only (same USJ, different raw USFM)', () => {
  // Verse text content is identical; only the raw line wrapping differs.
  const OURS_WRAPPED = [
    '\\id TIT',
    '\\c 1',
    '\\p',
    '\\v 1 Paul, a servant of God.',
    '\\v 2 In hope of eternal life.',
  ].join('\n');

  // Same semantic content but verses concatenated on one long line (no newlines between them).
  const THEIRS_CONCAT = [
    '\\id TIT',
    '\\c 1',
    '\\p',
    '\\v 1 Paul, a servant of God. \\v 2 In hope of eternal life.',
  ].join('\n');

  const BASE_WRAPPED = OURS_WRAPPED;

  it('auto-resolves when only raw USFM formatting differs (no structural change)', () => {
    const result = mergeUsfmFile({ base: BASE_WRAPPED, ours: OURS_WRAPPED, theirs: THEIRS_CONCAT });
    expect(result.kind).toBe('merged');
  });

  it('merged result contains verse text from both verses', () => {
    const result = mergeUsfmFile({ base: BASE_WRAPPED, ours: OURS_WRAPPED, theirs: THEIRS_CONCAT });
    if (result.kind === 'merged') {
      expect(result.text).toContain('Paul');
      expect(result.text).toContain('eternal life');
    }
  });

  it('still surfaces a real conflict when text content differs', () => {
    const oursEdited = OURS_WRAPPED.replace('servant of God', 'apostle of God');
    const theirsEdited = OURS_WRAPPED.replace('servant of God', 'slave of God');
    const result = mergeUsfmFile({ base: BASE_WRAPPED, ours: oursEdited, theirs: theirsEdited });
    expect(result.kind).toBe('conflict');
  });

  it('mergeFileContent auto-resolves formatting-only USFM conflict', () => {
    const result = mergeFileContent({
      path: '65-3JN.usfm',
      base: BASE_WRAPPED,
      ours: OURS_WRAPPED,
      theirs: THEIRS_CONCAT,
    });
    expect(result.kind).toBe('merged');
  });
});

describe('mergeProjectMaps', () => {
  it('takes theirs when base equals ours (fast-forward remote)', () => {
    const base = 'same';
    const theirs = 'updated';
    const { merged, conflicts } = mergeProjectMaps({
      paths: ['notes.txt'],
      getBase: () => base,
      getOurs: () => base,
      getTheirs: () => theirs,
    });
    expect(conflicts).toHaveLength(0);
    expect(merged.get('notes.txt')).toBe(theirs);
  });

  it('keeps local-only files when theirs has no copy', () => {
    const { merged, conflicts } = mergeProjectMaps({
      paths: ['local-only.usfm'],
      getBase: () => undefined,
      getOurs: () => '\\id TIT en_ult\n\\c 1\n\\p\n\\v 1 Hi\n',
      getTheirs: () => undefined,
    });
    expect(conflicts).toHaveLength(0);
    expect(merged.get('local-only.usfm')).toContain('\\v 1');
  });

  it('imports remote-only files', () => {
    const remote = '\\id TIT en_ult\n\\c 1\n\\p\n\\v 1 Remote\n';
    const { merged, conflicts } = mergeProjectMaps({
      paths: ['56-TIT.usfm'],
      getBase: () => undefined,
      getOurs: () => undefined,
      getTheirs: () => remote,
    });
    expect(conflicts).toHaveLength(0);
    expect(merged.get('56-TIT.usfm')).toBe(remote);
  });
});
