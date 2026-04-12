import * as fs from 'node:fs';
import * as path from 'node:path';

import { USFM_CHROME_CSS_VARIABLES } from '../src/tokens';

describe('USFM_CHROME_CSS_VARIABLES', () => {
  it('lists every token that the default .ProseMirror block defines', () => {
    const basePath = path.join(__dirname, '..', 'base.css');
    const css = fs.readFileSync(basePath, 'utf8');
    const defaultBlock = css.split('.ProseMirror[data-usfm-theme')[0] ?? css;
    const defined = new Set<string>();
    const re = /\n\s+(--usfm-[a-z0-9-]+):/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(defaultBlock)) !== null) {
      defined.add(m[1]!);
    }
    for (const name of defined) {
      expect(USFM_CHROME_CSS_VARIABLES).toContain(name);
    }
  });

  it('includes optional translator-milestone accent tokens used in base.css', () => {
    const basePath = path.join(__dirname, '..', 'base.css');
    const css = fs.readFileSync(basePath, 'utf8');
    for (const token of [
      '--usfm-ts-standalone-fg',
      '--usfm-ts-start-fg',
      '--usfm-ts-start-accent',
      '--usfm-ts-end-fg',
      '--usfm-ts-end-accent',
    ] as const) {
      expect(css).toContain(token);
      expect(USFM_CHROME_CSS_VARIABLES).toContain(token);
    }
  });
});
