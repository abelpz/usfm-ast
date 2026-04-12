import * as fs from 'node:fs';
import * as path from 'node:path';

describe('markers.css', () => {
  it('contains generated paragraph marker rules', () => {
    const p = path.join(__dirname, '..', 'markers.css');
    const css = fs.readFileSync(p, 'utf8');
    expect(css).toContain('.ProseMirror .usfm-para[data-marker=');
    expect(css).toMatch(/data-marker='p'\]/);
  });
});
