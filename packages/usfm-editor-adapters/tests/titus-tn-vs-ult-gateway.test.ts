import { readFileSync } from 'node:fs';
import path from 'node:path';

import { DocumentStore } from '@usfm-tools/editor-core';

import { alignedGatewayQuoteForHelp } from '../src/helps/alignment-annotate';
import { parseTnTsv } from '../src/helps/twl-tn-loaders';

const FIXTURES = path.join(__dirname, 'fixtures');

/** Real en_tn Titus 1:1 row — Greek `Quote` includes a comma after `Θεοῦ` (must still align to en_ult). */
const TN_TITUS_1_1_ABSTRACT_NOUNS = `Reference	ID	Tags	SupportReference	Quote	Occurrence	Note
1:1	rtc9		rc://*/ta/man/translate/figs-abstractnouns	κατὰ πίστιν ἐκλεκτῶν Θεοῦ, καὶ ἐπίγνωσιν ἀληθείας	1	The words **faith**
`;

describe('en_tn Titus vs en_ult (aligned gateway quotes)', () => {
  it('builds gateway text for Titus 1:1 TN Greek quote that contains an internal comma (regression)', () => {
    const usfm = readFileSync(path.join(FIXTURES, 'titus-57-v1-snippet.usfm'), 'utf8');
    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);

    const [row] = parseTnTsv(TN_TITUS_1_1_ABSTRACT_NOUNS);
    expect(row).toBeDefined();
    expect(row!.origWords).toContain('Θεοῦ,');

    const gateway = alignedGatewayQuoteForHelp(store, row!);
    expect(gateway).not.toBeNull();
    expect(gateway!.toLowerCase()).toMatch(/faith/);
    expect(gateway!.toLowerCase()).toMatch(/truth|chosen|god/);
  });

  it('builds a non-empty gateway quote for every verse-scoped TN row (fixtures: tn_TIT.tsv + 57-TIT.usfm)', () => {
    const usfm = readFileSync(path.join(FIXTURES, 'titus-57-full.usfm'), 'utf8');
    const tsv = readFileSync(path.join(FIXTURES, 'tn_TIT.tsv'), 'utf8');

    const store = new DocumentStore({ silentConsole: true });
    store.loadUSFM(usfm);

    const rows = parseTnTsv(tsv);
    const failures: string[] = [];

    for (const row of rows) {
      if (row.ref.segment === 'bookIntro' || row.ref.segment === 'chapterIntro') continue;
      if (!row.ref.chapter || !row.ref.verse) continue;
      const quote = (row.origWords ?? '').trim();
      if (!quote) continue;

      const gateway = alignedGatewayQuoteForHelp(store, row);
      if (!gateway?.trim()) {
        failures.push(
          `${row.id} ${row.ref.chapter}:${row.ref.verse} occ=${row.occurrence} → ${quote.slice(0, 80)}${quote.length > 80 ? '…' : ''}`,
        );
      }
    }

    expect({
      failureCount: failures.length,
      failures: failures.slice(0, 20),
    }).toEqual({ failureCount: 0, failures: [] });
  }, 30_000);
});
