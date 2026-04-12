import type { AlignmentDocument } from '@usfm-tools/types';
import {
  createAlignmentDocument,
  parseAlignmentJson,
  parseAlignmentText,
  parseAlignmentTsv,
  serializeAlignmentJson,
  serializeAlignmentText,
  serializeAlignmentTsv,
} from '../src/alignment-io';

const meta = {
  translation: { id: 'TIT es' },
  source: { id: 'TIT ugnt', version: '85' },
  created: '2026-01-01T00:00:00.000Z',
  updated: '2026-01-02T00:00:00.000Z',
};

const sampleVerses = {
  'TIT 1:1': [
    {
      sources: [
        {
          content: 'Παῦλος',
          strong: 'G39720',
          lemma: 'Παῦλος',
          occurrence: 1,
          occurrences: 1,
        },
      ],
      targets: [{ word: 'Pablo', occurrence: 1, occurrences: 1 }],
    },
    {
      sources: [
        {
          content: 'Θεοῦ',
          strong: 'G23160',
          lemma: 'θεός',
          occurrence: 1,
          occurrences: 2,
        },
      ],
      targets: [
        { word: 'de', occurrence: 1, occurrences: 2 },
        { word: 'Dios', occurrence: 1, occurrences: 1 },
      ],
    },
  ],
};

const sampleDoc: AlignmentDocument = {
  format: 'usfm-alignment',
  version: '1.0',
  ...meta,
  verses: sampleVerses,
};

describe('alignment-io', () => {
  it('JSON round-trip', () => {
    const s = serializeAlignmentJson(sampleDoc);
    const back = parseAlignmentJson(s);
    expect(back.format).toBe('usfm-alignment');
    expect(back.version).toBe('1.0');
    expect(back.translation.id).toBe('TIT es');
    expect(back.source.id).toBe('TIT ugnt');
    expect(back.verses['TIT 1:1']?.length).toBe(2);
    expect(back.verses['TIT 1:1']?.[0]?.sources[0]?.content).toBe('Παῦλος');
  });

  it('TSV round-trip', () => {
    const tsv = serializeAlignmentTsv(sampleDoc);
    const back = parseAlignmentTsv(tsv, meta);
    expect(back.verses['TIT 1:1']?.length).toBe(2);
    expect(back.verses['TIT 1:1']?.[0]?.sources[0]?.content).toBe('Παῦλος');
    expect(back.verses['TIT 1:1']?.[1]?.targets.map((t) => t.word).join('+')).toBe('de+Dios');
  });

  it('text round-trip (arrow format)', () => {
    const text = serializeAlignmentText(sampleDoc);
    const back = parseAlignmentText(text, meta);
    expect(back.verses['TIT 1:1']?.length).toBe(2);
    expect(back.verses['TIT 1:1']?.[0]?.sources[0]?.strong).toBe('G39720');
    expect(back.verses['TIT 1:1']?.[1]?.targets.length).toBe(2);
  });

  it('createAlignmentDocument', () => {
    const d = createAlignmentDocument({ id: 'A' }, { id: 'B' }, {});
    expect(d.format).toBe('usfm-alignment');
    expect(d.verses).toEqual({});
  });
});
