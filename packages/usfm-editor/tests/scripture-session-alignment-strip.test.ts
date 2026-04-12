/** @jest-environment jsdom */

import { ScriptureSession } from '../src/scripture-session';

/** Minimal USFM with unfoldingWord-style alignment in verse 1. */
const USFM_WITH_ALIGN = String.raw`\id TIT EN
\c 1
\p
\v 1 \zaln-s |x-strong="a" x-lemma="b" x-content="c" x-occurrence="1" x-occurrences="1"\*\w Hello\w*\zaln-e\* tail.
`;

describe('ScriptureSession alignment strip for content editor', () => {
  it('keeps store USJ free of zaln while export merges alignments back', () => {
    const el = document.createElement('div');
    const session = new ScriptureSession(el, {});
    session.loadUSFM(USFM_WITH_ALIGN);

    const stored = JSON.stringify(session.store.getFullUSJ());
    expect(stored).not.toContain('zaln-s');
    expect(stored).not.toContain('zaln-e');

    const exported = session.toUSFM();
    expect(exported).toMatch(/zaln-s/i);
    expect(exported).toMatch(/zaln-e/i);

    expect(Object.keys(session.getAlignments()).length).toBeGreaterThan(0);

    session.contentView.destroy();
  });
});
