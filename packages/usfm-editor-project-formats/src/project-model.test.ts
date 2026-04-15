import { detectRepoFormatFromRootEntries } from './project-model';

describe('detectRepoFormatFromRootEntries', () => {
  it('prefers scripture burrito when metadata.json exists', () => {
    expect(
      detectRepoFormatFromRootEntries([
        { name: 'metadata.json', type: 'file' },
        { name: 'manifest.yaml', type: 'file' },
      ]),
    ).toBe('scripture-burrito');
  });

  it('detects resource container from manifest.yaml', () => {
    expect(
      detectRepoFormatFromRootEntries([
        { name: 'manifest.yaml', type: 'file' },
        { name: 'README.md', type: 'file' },
      ]),
    ).toBe('resource-container');
  });

  it('detects raw usfm from root .usfm files', () => {
    expect(
      detectRepoFormatFromRootEntries([
        { name: '57-TIT.usfm', type: 'file' },
      ]),
    ).toBe('raw-usfm');
  });
});
