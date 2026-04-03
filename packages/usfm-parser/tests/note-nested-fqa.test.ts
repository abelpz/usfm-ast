import fs from 'fs';
import path from 'path';
import { USFMParser } from '../src';

/**
 * NoteContent markers (`\\ft`, `\\fqa`, …) are **siblings** in the AST (registry: implicit close
 * when the next footnote-character opens). A generic `\\f*` closes only the innermost open span;
 * trailing text before the final `\\f*` stays at note level — BSB Jonah 1:13.
 */
describe('footnote note-content stack (sibling \\ft / \\fqa, generic \\f* closes inner span)', () => {
  it('parses \\ft … \\fqa … \\f* … with \\fqa sibling of \\ft, trailing text in note', () => {
    const usfm =
      '\\p \\v 13 Nevertheless, the men rowed hard\\f + \\fr 1:13 \\ft Hebrew \\fqa the men dug in\\f* to get back to dry land.\\f*';
    const parser = new USFMParser();
    parser.load(usfm).parse();
    const root = parser.toJSON() as {
      content?: Array<{ type?: string; content?: unknown[] }>;
    };
    const para = root.content?.find((n) => (n as { type?: string }).type === 'para');
    const verseBlock = para?.content ?? [];
    const note = verseBlock.find((n) => (n as { type?: string }).type === 'note') as {
      type: string;
      marker: string;
      caller?: string;
      content: unknown[];
    };
    expect(note?.marker).toBe('f');
    expect(note?.caller).toBe('+');
    const ft = note.content.find((n) => (n as { marker?: string }).marker === 'ft') as {
      marker: string;
      content: unknown[];
    };
    expect(ft).toBeTruthy();
    expect(
      ft.content.map((c) => (typeof c === 'string' ? c : (c as { content?: string }).content))
    ).toEqual(['Hebrew ']);
    const fqa = note.content.find((n) => (n as { marker?: string }).marker === 'fqa') as {
      marker: string;
      content: unknown[];
    };
    expect(fqa).toBeTruthy();
    expect(
      fqa.content.map((c) => (typeof c === 'string' ? c : (c as { content?: string }).content))
    ).toEqual(['the men dug in']);
    const noteJson = JSON.stringify(note.content);
    expect(noteJson).toContain('to get back');
  });

  it('single \\f* after \\fqa ends the footnote; following verse text is paragraph sibling, not in note', () => {
    // Escaped backslashes: a normal JS string would treat \\b in \\bd as backspace and corrupt USFM.
    const usfm =
      '\\p \\v 13 Nevertheless, the men rowed hard\\f + \\fr 1:13 \\ft Hebrew \\fqa the \\bd men\\bd* dug in\\f* to get back to dry land, but they could not, for the sea was raging against them more and more.';
    const parser = new USFMParser();
    parser.load(usfm).parse();
    const root = parser.toJSON() as {
      content?: Array<{ type?: string; content?: unknown[] }>;
    };
    const para = root.content?.find((n) => (n as { type?: string }).type === 'para');
    const verseBlock = para?.content ?? [];
    const note = verseBlock.find((n) => (n as { type?: string }).type === 'note') as {
      type: string;
      marker: string;
      content: unknown[];
    };
    expect(note?.marker).toBe('f');
    const noteJson = JSON.stringify(note.content);
    expect(noteJson).not.toContain('to get back');
    const afterNote = verseBlock.slice(verseBlock.indexOf(note) + 1);
    const tail = afterNote.filter((n) => typeof n === 'string').join('');
    expect(tail).toContain('to get back to dry land');
  });

  /**
   * BSB Jonah 1:13 footnote: verse text after the only `\\f*` must stay in the paragraph, not in
   * `note.content`. `\\id` + `\\c` are included so the verse gets `sid: JON 1:13` (same as full books).
   * Use String.raw — in a normal template, `\\bd` would parse `\\b` as backspace and break input.
   */
  it('Jonah 1:13 BSB footnote: full para USJ (note ends at \\f*; trailing text; \\bd inside \\fqa)', () => {
    const usfm = String.raw`\id JON
\c 1
\p \v 13 Nevertheless, the men rowed hard\f + \fr 1:13 \ft Hebrew \fqa the \bd men\bd* dug in\f* to get back to dry land, but they could not, for the sea was raging against them more and more.`;
    const parser = new USFMParser({ silentConsole: true });
    parser.load(usfm).parse();
    const root = parser.toJSON() as {
      content?: Array<{ type?: string; marker?: string; content?: unknown[] }>;
    };
    const para = root.content?.find((n) => n.type === 'para' && n.marker === 'p');
    expect(para).toEqual({
      type: 'para',
      marker: 'p',
      content: [
        {
          marker: 'v',
          number: '13',
          type: 'verse',
          sid: 'JON 1:13',
        },
        'Nevertheless, the men rowed hard',
        {
          type: 'note',
          marker: 'f',
          content: [
            {
              marker: 'fr',
              content: ['1:13 '],
              type: 'char',
            },
            {
              marker: 'ft',
              content: ['Hebrew '],
              type: 'char',
            },
            {
              marker: 'fqa',
              content: [
                'the ',
                {
                  marker: 'bd',
                  content: ['men'],
                  type: 'char',
                },
                ' dug in',
              ],
              type: 'char',
            },
          ],
          caller: '+',
        },
        ' to get back to dry land, but they could not, for the sea was raging against them more and more.',
      ],
    });
  });

  it('matches Jonah 1:13 BSB footnote substring in fixtures/usfm/jonah.bsb.usfm', () => {
    const file = path.join(__dirname, 'fixtures', 'usfm', 'jonah.bsb.usfm');
    const book = fs.readFileSync(file, 'utf8');
    const needle =
      '\\f + \\fr 1:13 \\ft Hebrew \\fqa the \\bd men\\bd* dug in\\f* to get back to dry land, but they could not';
    expect(book).toContain(needle);
    const parser = new USFMParser();
    parser.load(book).parse();
    const j = parser.toJSON() as { content?: unknown[] };
    expect(j.content?.length).toBeGreaterThan(0);
  });

  /**
   * Full-book regression: global `\\f*` lookahead false-positived on a *later* footnote in the file.
   * Verse tail must stay in the paragraph (same as minimal Jonah snippet).
   */
  it('jonah.bsb.usfm: JON 1:13 footnote does not absorb verse text (multi-footnote file)', () => {
    const file = path.join(__dirname, 'fixtures', 'usfm', 'jonah.bsb.usfm');
    const book = fs.readFileSync(file, 'utf8');
    const parser = new USFMParser({ silentConsole: true });
    parser.load(book).parse();
    const root = parser.toJSON() as { content?: unknown[] };

    function findParaJonah1_13(nodes: unknown[] | undefined): { content: unknown[] } | null {
      if (!nodes) return null;
      for (const n of nodes) {
        if (!n || typeof n !== 'object') continue;
        const o = n as { type?: string; content?: unknown[] };
        if (o.type === 'para' && Array.isArray(o.content)) {
          const v = o.content.find(
            (x) =>
              x &&
              typeof x === 'object' &&
              (x as { type?: string }).type === 'verse' &&
              (x as { number?: string }).number === '13' &&
              (x as { sid?: string }).sid === 'JON 1:13'
          );
          if (v) return { content: o.content };
        }
        const inner = findParaJonah1_13(o.content);
        if (inner) return inner;
      }
      return null;
    }

    const para = findParaJonah1_13(root.content);
    expect(para).toBeTruthy();
    const block = para!.content;
    const note = block.find(
      (x) => x && typeof x === 'object' && (x as { type?: string }).type === 'note'
    ) as {
      content: unknown[];
    };
    expect(note).toBeTruthy();
    expect(JSON.stringify(note.content)).not.toContain('to get back');
    const tail = block.filter((x) => typeof x === 'string').join('');
    expect(tail).toContain('to get back to dry land');
  });
});
