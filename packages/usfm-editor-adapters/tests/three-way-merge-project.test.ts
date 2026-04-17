import { mergeProjectMaps } from '../src/three-way-merge-project';

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
