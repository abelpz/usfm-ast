/**
 * Unit tests for rebuild-aligned.ts covering the alignment patterns documented in
 * docs/29-alignment-patterns-english-spanish.md:
 *
 *  - Punctuation attached to aligned token (e.g. "Pablo,")
 *  - Repeated surface words (occurrence disambiguation)
 *  - N:M (stacked zaln-s, multiple \w)
 *  - Non-contiguous group (1:N with interrupting token)
 *  - Non-contiguous N:M (span-based open/close across interrupting groups)
 *  - Inverted clause order (cross-mapped x-occurrence)
 */

import { rebuildAlignedUsj } from '../src/rebuild-aligned';
import type { AlignmentMap, EditableUSJ } from '@usfm-tools/types';

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
  it('emits \\w with the clean word and the suffix comma as a plain string', () => {
    // "Pablo," — after stripping, the raw token is "Pablo," (comma merged).
    // The AlignedWord.word is "Pablo" (no comma).
    const alignments: AlignmentMap = {
      'TST 1:1': [
        {
          sources: [{ strong: 'G1', lemma: 'Paul', content: 'Paul', occurrence: 1, occurrences: 1 }],
          targets: [{ word: 'Pablo', occurrence: 1, occurrences: 1 }],
        },
      ],
    };
    const rebuilt = rebuildAlignedUsj(makeEditable('Pablo, siervo'), alignments);
    const flat = flattenContent(rebuilt.content);
    expect(flat).toContain('zaln-s:Paul:occ1');
    expect(flat).toContain('w:Pablo:occ1/1');
    // The comma should appear as a plain string after the \w node.
    const wIdx = flat.findIndex((x) => x === 'w:Pablo:occ1/1');
    expect(flat[wIdx + 1]).toBe('str:,');
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
  it('keeps outer zaln-s open while an inner group is emitted between its targets', () => {
    // English: The [Comforter] will help [you].
    // Spanish: El que los consuela está aquí
    //   que → Comforter (pos 1)
    //   los → you      (pos 2, interrupts)
    //   consuela → Comforter (pos 3)
    const alignments: AlignmentMap = {
      'TST 1:1': [
        {
          sources: [{ strong: 'G1', lemma: 'Comforter', content: 'Comforter', occurrence: 1, occurrences: 1 }],
          targets: [
            { word: 'que', occurrence: 1, occurrences: 1 },
            { word: 'consuela', occurrence: 1, occurrences: 1 },
          ],
        },
        {
          sources: [{ strong: 'G2', lemma: 'you', content: 'you', occurrence: 1, occurrences: 1 }],
          targets: [{ word: 'los', occurrence: 1, occurrences: 1 }],
        },
      ],
    };
    const rebuilt = rebuildAlignedUsj(
      makeEditable('El que los consuela está aquí'),
      alignments,
    );
    const flat = flattenContent(rebuilt.content);

    // zaln-s Comforter opens before "que" (firstPos of Comforter group = 1)
    const openComforter = flat.findIndex((x) => x === 'zaln-s:Comforter:occ1');
    const wQue = flat.findIndex((x) => x === 'w:que:occ1/1');
    // zaln-s you opens before "los" (nested inside Comforter span)
    const openYou = flat.findIndex((x) => x === 'zaln-s:you:occ1');
    const wLos = flat.findIndex((x) => x === 'w:los:occ1/1');
    // zaln-e closes you first (inner), then Comforter last (outer)
    const closeYou = flat.indexOf('zaln-e', wLos);
    const wConsuela = flat.findIndex((x) => x === 'w:consuela:occ1/1');
    const closeComforter = flat.indexOf('zaln-e', wConsuela);

    expect(openComforter).toBeLessThan(wQue);
    expect(openYou).toBeLessThan(wLos);
    expect(closeYou).toBeLessThan(wConsuela);
    expect(wConsuela).toBeLessThan(closeComforter);
    // Comforter span must still be open (not yet closed) between que and consuela
    expect(openComforter).toBeLessThan(openYou);
    expect(closeYou).toBeLessThan(closeComforter);
  });
});

// ---------------------------------------------------------------------------
// Non-contiguous N:M (Sec 5b)
// ---------------------------------------------------------------------------

describe('non-contiguous N:M', () => {
  it('span covers interrupting groups: llevó ... la misión ... a cabo', () => {
    // "carried out" → "llevó a cabo" (2:3 N:M), interrupted by "la misión"
    const alignments: AlignmentMap = {
      'TST 1:1': [
        {
          sources: [
            { strong: 'G1', lemma: 'carried', content: 'carried', occurrence: 1, occurrences: 1 },
            { strong: 'G2', lemma: 'out', content: 'out', occurrence: 1, occurrences: 1 },
          ],
          targets: [
            { word: 'llevó', occurrence: 1, occurrences: 1 },
            { word: 'a', occurrence: 1, occurrences: 1 },
            { word: 'cabo', occurrence: 1, occurrences: 1 },
          ],
        },
        {
          sources: [{ strong: 'G3', lemma: 'the', content: 'the', occurrence: 1, occurrences: 1 }],
          targets: [{ word: 'la', occurrence: 1, occurrences: 1 }],
        },
        {
          sources: [{ strong: 'G4', lemma: 'mission', content: 'mission', occurrence: 1, occurrences: 1 }],
          targets: [{ word: 'misión', occurrence: 1, occurrences: 1 }],
        },
      ],
    };
    const rebuilt = rebuildAlignedUsj(
      makeEditable('Él llevó la misión a cabo'),
      alignments,
    );
    const flat = flattenContent(rebuilt.content);

    const openCarried = flat.findIndex((x) => x === 'zaln-s:carried:occ1');
    const openOut = flat.findIndex((x) => x === 'zaln-s:out:occ1');
    const wLlevo = flat.findIndex((x) => x === 'w:llevó:occ1/1');
    const wA = flat.findIndex((x) => x === 'w:a:occ1/1');
    const wCabo = flat.findIndex((x) => x === 'w:cabo:occ1/1');
    const openThe = flat.findIndex((x) => x === 'zaln-s:the:occ1');
    const wLa = flat.findIndex((x) => x === 'w:la:occ1/1');
    const closeLast = flat.lastIndexOf('zaln-e');

    // Outer group (carried+out) opens before llevó
    expect(openCarried).toBeLessThan(wLlevo);
    expect(openOut).toBeLessThan(wLlevo);
    // la + misión are nested inside the outer group's span
    expect(openThe).toBeGreaterThan(wLlevo);
    expect(wLa).toBeGreaterThan(openThe);
    // a and cabo come after la/misión groups close
    expect(wA).toBeGreaterThan(wLa);
    expect(wCabo).toBeGreaterThan(wA);
    // Outer group closes last
    expect(closeLast).toBeGreaterThan(wCabo);
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
