import { mergeResourceContainerForEnhancedLayout } from './enhanced-bootstrap';
import type { ResourceContainerManifest } from './resource-container';

describe('mergeResourceContainerForEnhancedLayout', () => {
  it('fills x_extensions.checking and keeps projects', () => {
    const m: ResourceContainerManifest = {
      dublin_core: {
        conformsto: 'rc0.2',
        identifier: 'tpl',
        title: 'Test',
        language: { identifier: 'es-419' },
      },
      projects: [{ identifier: 'tit', path: './57-TIT.usfm' }],
    };
    const out = mergeResourceContainerForEnhancedLayout(m);
    expect(out.x_extensions?.checking?.path).toMatch(/checking/);
    expect(out.x_extensions?.alignments?.sources).toEqual([]);
    expect(out.projects).toHaveLength(1);
  });
});
