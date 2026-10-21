/**
 * Unit tests for rebuild-aligned.ts covering the alignment patterns documented in
 * docs/29-alignment-patterns-english-spanish.md:
 *
 *  - Punctuation attached to aligned token (e.g. "Pablo,")
 *  - Repeated surface words (occurrence disambiguation)
 *  - N:M (stacked zaln-s, multiple \w)
 *  - Non-contiguous group (1:N with interrupting token): written again where it goes on, never left open
 *  - Non-contiguous N:M
 *  - Inverted clause order (cross-mapped x-occurrence)
 *  - A verse on more than one line (poetry), parts of a word aligned each on its own, a group that cannot be placed
 */

import { stripAlignments } from '@usfm-tools/usj-core';
import { rebuildAlignedUsj } from '../src/rebuild-aligned';
import type { AlignmentGroup, AlignmentMap, EditableUSJ } from '@usfm-tools/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEditable(verseText: string): EditableUSJ {
  return {
    type: 'EditableUSJ',
    version: '3.1',
    content: [
      { type: 'verse', sid: 'TST 1:1', number: '1' },
      verseText,
    ],
  };
}

/**
 * Flatten the rebuilt content array into a sequence of [marker?, text?] descriptors that are
 * easy to assert against.  Non-string leaf values become the marker string; strings become the
 * text.  This avoids depending on exact USJ node shapes.
 */
function flattenContent(content: unknown[]): string[] {
  const out: string[] = [];
  const walk = (nodes: unknown[]) => {
    for (const n of nodes) {
      if (typeof n === 'string') {
        out.push(`str:${n}`);
      } else if (typeof n === 'object' && n !== null) {
        const o = n as Record<string, unknown>;
        if (o.marker === 'zaln-s') out.push(`zaln-s:${o['x-content']}:occ${o['x-occurrence']}`);
        else if (o.marker === 'zaln-e') out.push('zaln-e');
        else if (o.marker === 'w') {
          const text = Array.isArray(o.content) ? o.content[0] : '';
          out.push(`w:${text}:occ${o['x-occurrence']}/${o['x-occurrences']}`);
        } else if (Array.isArray(o.content)) {
          walk(o.content as unknown[]);
        }
      }
    }
  };
  walk(content);
  return out;
}

/** The same, without the white space between words. */
const marks = (content: unknown[]) => flattenContent(content).filter((x) => !/^str:\s+$/.test(x));

/** A group of one original word, named by what it says. */
const group = (content: string, targets: [word: string, occurrence?: number, occurrences?: number][], occurrence = 1): AlignmentGroup => ({
  sources: [{ strong: `G-${content}`, lemma: content, content, occurrence, occurrences: 1 }],
  targets: targets.map(([word, occ = 1, of = 1]) => ({ word, occurrence: occ, occurrences: of })),
});

/** What is read back from what was written: the text of the verse and its groups. */
function readBack(content: unknown[], sid = 'TST 1:1') {
  const { editable, alignments } = stripAlignments({ type: 'USJ', version: '3.1', content });
  const text = (nodes: unknown[]): string =>
    nodes.map((n) => (typeof n === 'string' ? n : Array.isArray((n as { content?: unknown[] }).content) ? text((n as { content: unknown[] }).content) : '')).join('');
  return { text: text(editable.content as unknown[]), groups: alignments[sid] ?? [] };
}

// ---------------------------------------------------------------------------
// 1:1 — basic sanity
// ---------------------------------------------------------------------------

describe('1:1 alignment', () => {
  it('emits one zaln-s / \\w / zaln-e pair for each group', () => {
    const alignments: AlignmentMap = {
      'TST 1:1': [
        { sources: [{ strong: 'G1', lemma: 'Peace', content: 'Peace', occurrence: 1, occurrences: 1 }], targets: [{ word: 'paz', occurrence: 1, occurrences: 1 }] },
        { sources: [{ strong: 'G2', lemma: 'God', content: 'God', occurrence: 1, occurrences: 1 }], targets: [{ word: 'Dios', occurrence: 1, occurrences: 1 }] },
      ],
    };
    const rebuilt = rebuildAlignedUsj(makeEditable('La paz viene de Dios'), alignments);
    const flat = flattenContent(rebuilt.content);
    expect(flat).toContain('zaln-s:Peace:occ1');
    expect(flat).toContain('w:paz:occ1/1');
    expect(flat).toContain('zaln-s:God:occ1');
    expect(flat).toContain('w:Dios:occ1/1');
  });
});

// ---------------------------------------------------------------------------
// Punctuation attached to aligned token
// ---------------------------------------------------------------------------

describe('punctuation attached to aligned token', () => {
  it('wraps the word alone in \\w and leaves the comma after the group, as other writers do', () => {
    // "Pablo," — after stripping, the raw token is "Pablo," (comma merged).
    // The AlignedWord.word is "Pablo" (no comma).
    const rebuilt = rebuildAlignedUsj(makeEditable('Pablo, siervo'), { 'TST 1:1': [group('Paul', [['Pablo']])] });
    expect(flattenContent(rebuilt.content)).toEqual(['zaln-s:Paul:occ1', 'w:Pablo:occ1/1', 'zaln-e', 'str:, ', 'str:siervo']);
    expect(readBack(rebuilt.content).text).toBe('Pablo, siervo');
  });

  it('leaves what opens a quotation before the group it opens', () => {
    const alignments = { 'TST 1:1': [group('said', [['dijo']]), group('May', [['Que']]), group('Lord', [['Señor']])] };
    const rebuilt = rebuildAlignedUsj(makeEditable('dijo: «¡Que el Señor!»'), alignments);
    expect(flattenContent(rebuilt.content)).toEqual([
      'zaln-s:said:occ1', 'w:dijo:occ1/1', 'zaln-e',
      'str:: «¡',
      'zaln-s:May:occ1', 'w:Que:occ1/1', 'zaln-e',
      'str: ', 'str:el', 'str: ',
      'zaln-s:Lord:occ1', 'w:Señor:occ1/1', 'zaln-e',
      'str:!»',
    ]);
    expect(readBack(rebuilt.content).text).toBe('dijo: «¡Que el Señor!»');
  });

  it.each([
    ['a straight quotation mark that opens', 'la palabra "amor" es una', ['palabra', 'amor', 'es']],
    ['a mark that opens after a group with nothing else between', 'la palabra «amor» es una', ['palabra', 'amor', 'es']],
    ['a dash that opens an aside', 'de amor —arrecifes ocultos— banquetean', ['amor', 'arrecifes', 'ocultos', 'banquetean']],
    ['a dash that joins two words', 'del gran día—como Sodoma', ['día', 'como', 'Sodoma']],
    ['a dash with a space on each side', 'la paz — la verdadera — viene', ['paz', 'verdadera', 'viene']],
    ['an ellipsis before a word', 'y dijo …vengan todos', ['dijo', 'vengan']],
    ['a straight quote right after a colon', 'Yo mismo dije: "Yo he sido apartado".', ['Yo', 'dije', 'Yo', 'apartado']],
  ])('is read back with the same text: %s', (_name, text, words) => {
    const seen: Record<string, number> = {};
    const all = text.match(/[\p{L}\p{N}]+/gu) ?? [];
    const groups = words.map((word, i) => {
      seen[word] = (seen[word] ?? 0) + 1;
      return group(`g${i}`, [[word, seen[word], all.filter((w) => w === word).length]]);
    });
    const rebuilt = rebuildAlignedUsj(makeEditable(text), { 'TST 1:1': groups });
    const back = readBack(rebuilt.content);
    expect(back.text).toBe(text);
    expect(back.groups).toEqual(groups);
  });

  it('keeps inside the group the space after it that would not be put back when the verse is read', () => {
    const alignments = { 'TST 1:1': [group('love', [['amor']]), group('reefs', [['arrecifes']])] };
    // The space after a group is not given back by the parser: «amor» + «—» + «arrecifes» would be «amor—arrecifes».
    expect(flattenContent(rebuildAlignedUsj(makeEditable('amor —arrecifes'), alignments).content)).toEqual([
      'zaln-s:love:occ1', 'w:amor:occ1/1', 'str: ', 'zaln-e',
      'str:—',
      'zaln-s:reefs:occ1', 'w:arrecifes:occ1/1', 'zaln-e',
    ]);
    // A dash that joins two words has no space to keep.
    expect(flattenContent(rebuildAlignedUsj(makeEditable('amor—arrecifes'), alignments).content)).toEqual([
      'zaln-s:love:occ1', 'w:amor:occ1/1', 'zaln-e',
      'str:—',
      'zaln-s:reefs:occ1', 'w:arrecifes:occ1/1', 'zaln-e',
    ]);
    // What opens a quotation is told apart by itself: the space is where other writers leave it.
    expect(flattenContent(rebuildAlignedUsj(makeEditable('amor «arrecifes»'), alignments).content)).toEqual([
      'zaln-s:love:occ1', 'w:amor:occ1/1', 'zaln-e',
      'str: «',
      'zaln-s:reefs:occ1', 'w:arrecifes:occ1/1', 'zaln-e',
      'str:»',
    ]);
    // Before a word no group has, and before a dash that stands alone.
    const one = { 'TST 1:1': [group('love', [['amor']])] };
    expect(flattenContent(rebuildAlignedUsj(makeEditable("amor 'tis — fin"), one).content)).toEqual([
      'zaln-s:love:occ1', 'w:amor:occ1/1', 'str: ', 'zaln-e', "str:'tis", 'str: — ', 'str:fin',
    ]);
    expect(flattenContent(rebuildAlignedUsj(makeEditable('amor — fin'), one).content)).toEqual([
      'zaln-s:love:occ1', 'w:amor:occ1/1', 'str: ', 'zaln-e', 'str:— ', 'str:fin',
    ]);
    expect(flattenContent(rebuildAlignedUsj(makeEditable('amor fin'), one).content)).toEqual([
      'zaln-s:love:occ1', 'w:amor:occ1/1', 'zaln-e', 'str: ', 'str:fin',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Repeated surface words — occurrence disambiguation (Sec 6 in patterns doc)
// ---------------------------------------------------------------------------

describe('repeated surface words', () => {
  it('uses occurrence index to place each \\w at the correct position', () => {
    // "Él vio a su hermano y a su hermana"
    // "su" appears twice; his|1 → first su, his|2 → second su
    const alignments: AlignmentMap = {
      'TST 1:1': [
        {
          sources: [{ strong: 'G1', lemma: 'He', content: 'He', occurrence: 1, occurrences: 1 }],
          targets: [{ word: 'Él', occurrence: 1, occurrences: 1 }],
        },
        {
          sources: [{ strong: 'G2', lemma: 'his', content: 'his', occurrence: 1, occurrences: 2 }],
          targets: [{ word: 'su', occurrence: 1, occurrences: 2 }],
        },
        {
          sources: [{ strong: 'G3', lemma: 'his', content: 'his', occurrence: 2, occurrences: 2 }],
          targets: [{ word: 'su', occurrence: 2, occurrences: 2 }],
        },
      ],
    };
    const rebuilt = rebuildAlignedUsj(
      makeEditable('Él vio a su hermano y a su hermana'),
      alignments,
    );
    const flat = flattenContent(rebuilt.content);
    // First "su" aligns to his|1
    const first = flat.findIndex((x) => x === 'zaln-s:his:occ1');
    expect(first).toBeGreaterThanOrEqual(0);
    expect(flat[first + 1]).toBe('w:su:occ1/2');
    // Second "su" aligns to his|2
    const second = flat.findIndex((x) => x === 'zaln-s:his:occ2');
    expect(second).toBeGreaterThan(first);
    expect(flat[second + 1]).toBe('w:su:occ2/2');
  });
});

// ---------------------------------------------------------------------------
// N:M — stacked zaln-s (Sec 4 in patterns doc)
// ---------------------------------------------------------------------------

describe('N:M stacked zaln-s', () => {
  it('emits all source zaln-s before the first \\w and all zaln-e after the last', () => {
    // "by and large" → "en general" (3:2)
    const alignments: AlignmentMap = {
      'TST 1:1': [
        {
          sources: [
            { strong: 'G1', lemma: 'by', content: 'by', occurrence: 1, occurrences: 1 },
            { strong: 'G2', lemma: 'and', content: 'and', occurrence: 1, occurrences: 1 },
            { strong: 'G3', lemma: 'large', content: 'large', occurrence: 1, occurrences: 1 },
          ],
          targets: [
            { word: 'en', occurrence: 1, occurrences: 1 },
            { word: 'general', occurrence: 1, occurrences: 1 },
          ],
        },
      ],
    };
    const rebuilt = rebuildAlignedUsj(makeEditable('en general'), alignments);
    // Filter out inter-token whitespace strings before asserting structure.
    const flat = flattenContent(rebuilt.content).filter((x) => x !== 'str: ');
    expect(flat).toEqual([
      'zaln-s:by:occ1',
      'zaln-s:and:occ1',
      'zaln-s:large:occ1',
      'w:en:occ1/1',
      'w:general:occ1/1',
      'zaln-e',
      'zaln-e',
      'zaln-e',
    ]);
  });
});

// ---------------------------------------------------------------------------
// Non-contiguous 1:N (Sec 5a)
// ---------------------------------------------------------------------------

describe('non-contiguous 1:N', () => {
  // English: The [Comforter] will help [you].
  // Spanish: El que los consuela está aquí
  //   que → Comforter (pos 1)
  //   los → you      (pos 2, interrupts)
  //   consuela → Comforter (pos 3)
  const alignments: AlignmentMap = {
    'TST 1:1': [group('Comforter', [['que'], ['consuela']]), group('you', [['los']])],
  };

  it('closes the group before the one that interrupts it, and writes it again where it goes on', () => {
    const rebuilt = rebuildAlignedUsj(makeEditable('El que los consuela está aquí'), alignments);
    expect(marks(rebuilt.content)).toEqual([
      'str:El',
      'zaln-s:Comforter:occ1', 'w:que:occ1/1', 'zaln-e',
      'zaln-s:you:occ1', 'w:los:occ1/1', 'zaln-e',
      'zaln-s:Comforter:occ1', 'w:consuela:occ1/1', 'zaln-e',
      'str:está', 'str:aquí',
    ]);
  });

  it('is read back as the one group it is', () => {
    const rebuilt = rebuildAlignedUsj(makeEditable('El que los consuela está aquí'), alignments);
    const back = readBack(rebuilt.content);
    expect(back.text).toBe('El que los consuela está aquí');
    expect(back.groups).toEqual(alignments['TST 1:1']);
  });

  it('is read as one group too from the nested form written before', () => {
    const s = (content: string) => ({ type: 'ms', marker: 'zaln-s', 'x-strong': `G-${content}`, 'x-lemma': content, 'x-content': content, 'x-occurrence': '1', 'x-occurrences': '1' });
    const e = { type: 'ms', marker: 'zaln-e' };
    const w = (word: string) => ({ type: 'char', marker: 'w', content: [word], 'x-occurrence': '1', 'x-occurrences': '1' });
    const nested = [{ type: 'verse', sid: 'TST 1:1', number: '1' }, 'El ', s('Comforter'), w('que'), ' ', s('you'), w('los'), e, ' ', w('consuela'), e, ' está aquí'];
    const back = readBack(nested);
    expect(back.text).toBe('El que los consuela está aquí');
    expect(back.groups).toEqual(alignments['TST 1:1']);
  });
});

// ---------------------------------------------------------------------------
// Non-contiguous N:M (Sec 5b)
// ---------------------------------------------------------------------------

describe('non-contiguous N:M', () => {
  it('writes the original words of the group again around each of its runs: llevó ... la misión ... a cabo', () => {
    // "carried out" → "llevó a cabo" (2:3 N:M), interrupted by "la misión"
    const carriedOut: AlignmentGroup = {
      sources: [
        { strong: 'G1', lemma: 'carried', content: 'carried', occurrence: 1, occurrences: 1 },
        { strong: 'G2', lemma: 'out', content: 'out', occurrence: 1, occurrences: 1 },
      ],
      targets: [
        { word: 'llevó', occurrence: 1, occurrences: 1 },
        { word: 'a', occurrence: 1, occurrences: 1 },
        { word: 'cabo', occurrence: 1, occurrences: 1 },
      ],
    };
    const alignments: AlignmentMap = { 'TST 1:1': [carriedOut, group('the', [['la']]), group('mission', [['misión']])] };
    const rebuilt = rebuildAlignedUsj(makeEditable('Él llevó la misión a cabo'), alignments);
    expect(marks(rebuilt.content)).toEqual([
      'str:Él',
      'zaln-s:carried:occ1', 'zaln-s:out:occ1', 'w:llevó:occ1/1', 'zaln-e', 'zaln-e',
      'zaln-s:the:occ1', 'w:la:occ1/1', 'zaln-e',
      'zaln-s:mission:occ1', 'w:misión:occ1/1', 'zaln-e',
      'zaln-s:carried:occ1', 'zaln-s:out:occ1', 'w:a:occ1/1', 'w:cabo:occ1/1', 'zaln-e', 'zaln-e',
    ]);
    expect(readBack(rebuilt.content).groups).toEqual(alignments['TST 1:1']);
  });
});

// ---------------------------------------------------------------------------
// Inverted clause order — cross-mapped x-occurrence (Sec 7)
// ---------------------------------------------------------------------------

describe('inverted clause order', () => {
  it('places groups at the correct gateway positions using stored occurrence', () => {
    // English order: grace of¹ God … peace of² Christ
    // Spanish order (inverted): paz de¹ Cristo … gracia de² Dios
    //
    // Spanish "de" occurrence 1 aligns to English "of" occurrence 2 (peace of Christ).
    // Spanish "de" occurrence 2 aligns to English "of" occurrence 1 (grace of God).
    const alignments: AlignmentMap = {
      'TST 1:1': [
        {
          sources: [{ strong: 'G1', lemma: 'peace', content: 'peace', occurrence: 1, occurrences: 1 }],
          targets: [{ word: 'paz', occurrence: 1, occurrences: 1 }],
        },
        {
          // First Spanish "de" → second English "of" (cross-mapped)
          sources: [{ strong: 'G2', lemma: 'of', content: 'of', occurrence: 2, occurrences: 2 }],
          targets: [{ word: 'de', occurrence: 1, occurrences: 2 }],
        },
        {
          sources: [{ strong: 'G3', lemma: 'grace', content: 'grace', occurrence: 1, occurrences: 1 }],
          targets: [{ word: 'gracia', occurrence: 1, occurrences: 1 }],
        },
        {
          // Second Spanish "de" → first English "of" (cross-mapped)
          sources: [{ strong: 'G4', lemma: 'of', content: 'of', occurrence: 1, occurrences: 2 }],
          targets: [{ word: 'de', occurrence: 2, occurrences: 2 }],
        },
      ],
    };
    const rebuilt = rebuildAlignedUsj(
      makeEditable('paz de Cristo y gracia de Dios'),
      alignments,
    );
    const flat = flattenContent(rebuilt.content);

    // First "de" in Spanish stream → x-occurrence="2" on zaln-s (cross-mapped)
    const firstDeZaln = flat.findIndex((x) => x === 'zaln-s:of:occ2');
    const firstDeW = flat.findIndex((x) => x === 'w:de:occ1/2');
    expect(firstDeZaln).toBeLessThan(firstDeW);

    // Second "de" in Spanish stream → x-occurrence="1" on zaln-s (cross-mapped)
    const secondDeZaln = flat.findIndex((x) => x === 'zaln-s:of:occ1');
    const secondDeW = flat.findIndex((x) => x === 'w:de:occ2/2');
    expect(secondDeZaln).toBeLessThan(secondDeW);

    // Cross-mapping: first zaln uses occ2 (not occ1), second uses occ1
    expect(firstDeZaln).toBeLessThan(secondDeZaln);
  });
});

// ---------------------------------------------------------------------------
// A verse on more than one line
// ---------------------------------------------------------------------------

describe('a verse written on more than one line', () => {
  // Jonah 2:2–3 as a team has it: the verse begins in a paragraph and goes on in two lines of the psalm.
  const poem = (): EditableUSJ => ({
    type: 'EditableUSJ',
    version: '3.1',
    content: [
      { type: 'chapter', marker: 'c', number: '2', sid: 'JON 2' },
      { type: 'para', marker: 'p', content: [{ type: 'verse', marker: 'v', number: '2', sid: 'JON 2:2' }, 'Y él dijo: '] },
      { type: 'para', marker: 'q1', content: ['Clamé a Jehová desde mi angustia; '] },
      { type: 'para', marker: 'q2', content: ['desde el vientre del Seol clamé. '] },
      { type: 'para', marker: 'q1', content: [{ type: 'verse', marker: 'v', number: '3', sid: 'JON 2:3' }, 'Ahora me echaste; '] },
      { type: 'para', marker: 'q2', content: ['todas tus ondas.'] },
    ],
  });
  const alignments: AlignmentMap = {
    'JON 2:2': [
      group('said', [['dijo']]),
      // One original word for words of two lines.
      group('cried', [['Clamé'], ['clamé']]),
      group('Yahweh', [['Jehová']]),
      group('from', [['desde', 1, 2]], 1),
      group('belly', [['desde', 2, 2], ['el'], ['vientre']]),
      group('Sheol', [['Seol']]),
    ],
    'JON 2:3': [group('cast', [['echaste']]), group('waves', [['ondas']])],
  };
  const paragraphs = (content: unknown[]) => content.filter((n) => (n as { type?: string }).type === 'para') as { marker: string; content: unknown[] }[];

  it('finds the words of the verse in every one of its lines', () => {
    const rebuilt = rebuildAlignedUsj(poem(), alignments);
    const [p, q1, q2, next, last] = paragraphs(rebuilt.content);
    expect(marks(p!.content)).toEqual(['str:Y', 'str:él', 'zaln-s:said:occ1', 'w:dijo:occ1/1', 'zaln-e', 'str:: ']);
    expect(marks(q1!.content)).toEqual([
      'zaln-s:cried:occ1', 'w:Clamé:occ1/1', 'zaln-e',
      'str:a',
      'zaln-s:Yahweh:occ1', 'w:Jehová:occ1/1', 'zaln-e',
      'zaln-s:from:occ1', 'w:desde:occ1/2', 'zaln-e',
      'str:mi', 'str:angustia;',
    ]);
    expect(marks(q2!.content)).toEqual([
      'zaln-s:belly:occ1', 'w:desde:occ2/2', 'w:el:occ1/1', 'w:vientre:occ1/1', 'zaln-e',
      'str:del',
      'zaln-s:Sheol:occ1', 'w:Seol:occ1/1', 'zaln-e',
      'zaln-s:cried:occ1', 'w:clamé:occ1/1', 'zaln-e',
      'str:. ',
    ]);
    expect(marks(next!.content)).toEqual(['str:Ahora', 'str:me', 'zaln-s:cast:occ1', 'w:echaste:occ1/1', 'zaln-e', 'str:; ']);
    expect(marks(last!.content)).toEqual(['str:todas', 'str:tus', 'zaln-s:waves:occ1', 'w:ondas:occ1/1', 'zaln-e', 'str:.']);
  });

  it('never leaves a group open from one line to the next', () => {
    const rebuilt = rebuildAlignedUsj(poem(), alignments);
    for (const para of paragraphs(rebuilt.content)) {
      const flat = flattenContent(para.content);
      expect(flat.filter((x) => x.startsWith('zaln-s')).length).toBe(flat.filter((x) => x === 'zaln-e').length);
    }
  });

  it('is read back with every group, the one of two lines as one', () => {
    const rebuilt = rebuildAlignedUsj(poem(), alignments);
    const { alignments: back } = stripAlignments({ type: 'USJ', version: '3.1', content: rebuilt.content });
    expect(back).toEqual(alignments);
  });
});

// ---------------------------------------------------------------------------
// Parts of a word, and groups that cannot be placed
// ---------------------------------------------------------------------------

describe('parts of a word aligned each on its own', () => {
  it.each([
    ['joined by a hyphen, in one group', 'he is self-condemned now', [group('being', [['he'], ['is'], ['self'], ['condemned']])], ['zaln-s:being:occ1', 'w:he:occ1/1', 'w:is:occ1/1', 'w:self:occ1/1', 'str:-', 'w:condemned:occ1/1', 'zaln-e', 'str:now']],
    ['joined by a dash, in two groups', 'and pleasures—living in malice', [group('pleasures', [['pleasures']]), group('living', [['living']])], ['str:and', 'zaln-s:pleasures:occ1', 'w:pleasures:occ1/1', 'zaln-e', 'str:—', 'zaln-s:living:occ1', 'w:living:occ1/1', 'zaln-e', 'str:in', 'str:malice']],
    ['the two halves of a number', 'más de 120.000 personas', [group('myriads', [['120'], ['000']])], ['str:más', 'str:de', 'zaln-s:myriads:occ1', 'w:120:occ1/1', 'str:.', 'w:000:occ1/1', 'zaln-e', 'str:personas']],
  ])('%s', (_name, text, groups, expected) => {
    const rebuilt = rebuildAlignedUsj(makeEditable(text), { 'TST 1:1': groups });
    expect(marks(rebuilt.content)).toEqual(expected);
    const back = readBack(rebuilt.content);
    expect(back.text).toBe(text);
    expect(back.groups).toEqual(groups);
  });

  it('counts a word among the parts of words when that is how it was numbered', () => {
    // «self» is the second of two for a writer that takes «self-condemned» for two words, and the only one for one that does not.
    const text = 'self-condemned by his own self';
    const byParts = [group('alone', [['self', 2, 2]])];
    expect(marks(rebuildAlignedUsj(makeEditable(text), { 'TST 1:1': byParts }).content)).toEqual(['str:self-condemned', 'str:by', 'str:his', 'str:own', 'zaln-s:alone:occ1', 'w:self:occ2/2', 'zaln-e']);
    const byWords = [group('alone', [['self', 1, 1]])];
    expect(marks(rebuildAlignedUsj(makeEditable(text), { 'TST 1:1': byWords }).content)).toEqual(['str:self-condemned', 'str:by', 'str:his', 'str:own', 'zaln-s:alone:occ1', 'w:self:occ1/1', 'zaln-e']);
    const whole = [group('judged', [['self-condemned']])];
    expect(marks(rebuildAlignedUsj(makeEditable(text), { 'TST 1:1': whole }).content).slice(0, 3)).toEqual(['zaln-s:judged:occ1', 'w:self-condemned:occ1/1', 'zaln-e']);
  });
});

describe('a group that cannot be placed', () => {
  it('is left out, and the other groups of the verse are kept', () => {
    const alignments: AlignmentMap = {
      'TST 1:1': [group('peace', [['paz']]), group('gone', [['palabra-que-ya-no-está']]), group('God', [['Dios']])],
    };
    const rebuilt = rebuildAlignedUsj(makeEditable('La paz viene de Dios'), alignments);
    expect(readBack(rebuilt.content).groups).toEqual([alignments['TST 1:1']![0], alignments['TST 1:1']![2]]);
  });

  it('is left out when another group already has its word', () => {
    const alignments: AlignmentMap = { 'TST 1:1': [group('peace', [['paz']]), group('other', [['paz']])] };
    const rebuilt = rebuildAlignedUsj(makeEditable('La paz viene'), alignments);
    expect(readBack(rebuilt.content).groups).toEqual([alignments['TST 1:1']![0]]);
  });
});

describe('what a group says of its original word', () => {
  it('is written in the order other writers use, with an empty lemma kept', () => {
    const alignments: AlignmentMap = {
      'TST 1:1': [{ sources: [{ strong: 'b', lemma: '', morph: 'He,R:Sp3fs', content: 'בָּהּ', occurrence: 1, occurrences: 1 }], targets: [{ word: 'en', occurrence: 1, occurrences: 1 }] }],
    };
    const rebuilt = rebuildAlignedUsj(makeEditable('en ella'), alignments);
    const start = rebuilt.content.find((n) => (n as { marker?: string }).marker === 'zaln-s') as Record<string, unknown>;
    expect(Object.keys(start)).toEqual(['type', 'marker', 'x-strong', 'x-lemma', 'x-morph', 'x-occurrence', 'x-occurrences', 'x-content']);
    expect(start['x-lemma']).toBe('');
  });
});
