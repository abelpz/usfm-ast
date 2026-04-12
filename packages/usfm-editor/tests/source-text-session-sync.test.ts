/** @jest-environment jsdom */

import { ScriptureSession } from '../src/scripture-session';
import { SourceTextSession } from '../src/source-text-session';

const SAMPLE = String.raw`\id TIT EN
\h Titus
\c 1
\p
\v 1 Hello.
`;

describe('SourceTextSession.syncSubsetFromTarget', () => {
  it('mirrors paginated identification (no chapter body)', () => {
    const mainEl = document.createElement('div');
    const srcEl = document.createElement('div');
    const main = new ScriptureSession(mainEl, { paginatedEditor: true, contextChapters: 0 });
    main.loadUSFM(SAMPLE);
    main.setContentPage({ kind: 'identification' });

    const src = new SourceTextSession(srcEl, { contextChapters: 0 });
    src.loadUSFM(SAMPLE);
    src.syncSubsetFromTarget(main);

    const kinds: string[] = [];
    src.contentView.state.doc.forEach((n) => kinds.push(n.type.name));
    expect(kinds.some((k) => k === 'chapter')).toBe(false);
    expect(src.contentView.state.doc.textContent).toMatch(/Titus|EN/);

    main.contentView.destroy();
    src.contentView.destroy();
  });

  it('mirrors paginated chapter 1', () => {
    const mainEl = document.createElement('div');
    const srcEl = document.createElement('div');
    const main = new ScriptureSession(mainEl, { paginatedEditor: true, contextChapters: 0 });
    main.loadUSFM(SAMPLE);
    main.setContentPage({ kind: 'chapter', chapter: 1 });

    const src = new SourceTextSession(srcEl, { contextChapters: 0 });
    src.loadUSFM(SAMPLE);
    src.syncSubsetFromTarget(main);

    const kinds: string[] = [];
    src.contentView.state.doc.forEach((n) => kinds.push(n.type.name));
    expect(kinds).toContain('chapter');
    expect(src.contentView.state.doc.textContent).toContain('Hello');

    main.contentView.destroy();
    src.contentView.destroy();
  });

  it('mirrors legacy introduction + chapters when not paginated', () => {
    const mainEl = document.createElement('div');
    const srcEl = document.createElement('div');
    const main = new ScriptureSession(mainEl, { paginatedEditor: false, contextChapters: 0 });
    main.loadUSFM(SAMPLE);
    main.setIntroductionVisible(true);
    main.setVisibleChapters([1]);

    const src = new SourceTextSession(srcEl, { contextChapters: 0 });
    src.loadUSFM(SAMPLE);
    src.syncSubsetFromTarget(main);

    expect(src.contentView.state.doc.textContent).toMatch(/Titus|Hello/);

    main.contentView.destroy();
    src.contentView.destroy();
  });
});
