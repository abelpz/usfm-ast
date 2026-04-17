import {
  detectRepoFormatFromRootEntries,
  probeEnhancedLayoutFromRootEntries,
} from './project-model';

describe('probeEnhancedLayoutFromRootEntries', () => {
  it('detects enhanced when both manifests exist', () => {
    expect(
      probeEnhancedLayoutFromRootEntries([
        { name: 'metadata.json', type: 'file' },
        { name: 'alignments/manifest.json', path: 'alignments/manifest.json', type: 'file' },
        { name: 'checking/manifest.json', path: 'checking/manifest.json', type: 'file' },
      ]),
    ).toEqual({
      enhanced: true,
      alignmentsManifest: true,
      checkingManifest: true,
    });
  });

  it('is not enhanced when only one manifest exists', () => {
    expect(
      probeEnhancedLayoutFromRootEntries([
        { name: 'alignments/manifest.json', path: 'alignments/manifest.json', type: 'file' },
      ]),
    ).toEqual({
      enhanced: false,
      alignmentsManifest: true,
      checkingManifest: false,
    });
  });
});

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
