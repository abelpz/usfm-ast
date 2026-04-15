import { DocumentStore } from '@usfm-tools/editor-core';
import type { HelpEntry } from '@usfm-tools/types';

import { alignedGatewayQuoteForHelp } from '../src/helps/alignment-annotate';

function help(ch: number, v: number, origWords: string, occurrence = 1): HelpEntry {
  return {
    id: 'h1',
    resourceType: 'tn',
    ref: { chapter: ch, verse: v },
    origWords,
    occurrence,
    content: '',
  };
}

describe('alignedGatewayQuoteForHelp', () => {
  it('uses quote match when verse has alignment groups but none match the help', () => {
    const usfm = `\\id TIT EL_UGNT
\\c 1
\\p
\\v 1 Παῦλος δοῦλος Θεοῦ
`;
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    store.updateAlignments(1, {
      'TIT 1:1': [
        {
          sources: [
            {
              strong: 'g1',
              lemma: 'λέγω',
              content: 'λέγω',
              occurrence: 1,
              occurrences: 1,
            },
          ],
          targets: [{ word: 'said', occurrence: 1, occurrences: 1 }],
        },
      ],
    });
    const q = alignedGatewayQuoteForHelp(store, help(1, 1, 'Παῦλος', 1));
    expect(q).toBe('Παῦλος');
  });

  it('maps origWords through alignment to gateway tokens when alignment matches', () => {
    const usfm = `\\id TIT EN_ULT
\\c 1
\\p
\\v 1 Paul servant
`;
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);
    store.updateAlignments(1, {
      'TIT 1:1': [
        {
          sources: [
            {
              strong: 'g5228',
              lemma: 'Παῦλος',
              content: 'Παῦλος',
              occurrence: 1,
              occurrences: 1,
            },
          ],
          targets: [{ word: 'Paul', occurrence: 1, occurrences: 1 }],
        },
      ],
    });
    const q = alignedGatewayQuoteForHelp(store, help(1, 1, 'Παῦλος', 1));
    expect(q).toBe('Paul');
  });
});
