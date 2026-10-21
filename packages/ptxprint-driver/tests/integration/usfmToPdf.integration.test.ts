import { diglotToPdf } from '../../src/api/diglotToPdf';
import { findPtxprint } from '../../src/runner/findPtxprint';
import { usfmToPdf } from '../../src/api/usfmToPdf';
import { usfmsToPdf } from '../../src/api/usfmsToPdf';

import { shouldRunPtxIntegration } from './integration-gate';

function resolveBin(): string | undefined {
  try {
    const explicit = process.env.PTXPRINT_BIN?.trim();
    return findPtxprint(explicit ? { explicitPath: explicit } : undefined);
  } catch {
    return undefined;
  }
}

const gate = shouldRunPtxIntegration();
const bin = gate ? resolveBin() : undefined;
const describeIntegration = gate && bin ? describe : describe.skip;

describeIntegration('usfmToPdf integration', () => {
  it('produces a PDF buffer with PDF magic', async () => {
    const minimal =
      '\\id JHN\n' +
      '\\ide UTF-8\n' +
      '\\h Gospel of John\n' +
      '\\mt1 John\n' +
      '\\c 1\n' +
      '\\p\n' +
      '\\v 1 In the beginning was the Word, and the Word was with God, and the Word was God.\n';

    const { pdf, bookCode } = await usfmToPdf(minimal, {
      ptxprintPath: bin,
      keepTempDir: false,
      timeoutMs: 900_000,
      paperSize: 'A5',
    });

    expect(bookCode).toBe('JHN');
    expect(pdf.slice(0, 5).toString('ascii')).toBe('%PDF-');
  }, 900_000);
});

describeIntegration('diglotToPdf integration', () => {
  it('produces a diglot PDF when both sides share the same book', async () => {
    const left =
      '\\id JHN\n\\c 1\n\\p\n\\v 1 En el principio era el Verbo.\n';
    const right =
      '\\id JHN\n\\c 1\n\\p\n\\v 1 In the beginning was the Word.\n';

    const { pdf, bookCode } = await diglotToPdf(
      { format: 'usfm', text: left },
      { format: 'usfm', text: right },
      {
        ptxprintPath: bin,
        keepTempDir: false,
        timeoutMs: 900_000,
        paperSize: 'A5',
      },
    );

    expect(bookCode).toBe('JHN');
    expect(pdf.slice(0, 5).toString('ascii')).toBe('%PDF-');
  }, 900_000);
});

describeIntegration('usfmsToPdf integration (multi-book)', () => {
  const john =
    '\\id JHN\n' +
    '\\ide UTF-8\n' +
    '\\h Gospel of John\n' +
    '\\mt1 John\n' +
    '\\c 1\n' +
    '\\p\n' +
    '\\v 1 In the beginning was the Word, and the Word was with God, and the Word was God.\n';

  const genesis =
    '\\id GEN\n' +
    '\\ide UTF-8\n' +
    '\\h Genesis\n' +
    '\\mt1 Genesis\n' +
    '\\c 1\n' +
    '\\p\n' +
    '\\v 1 In the beginning God created the heavens and the earth.\n';

  it('produces a PDF buffer covering two books', async () => {
    const { pdf, bookCode, bookCodes } = await usfmsToPdf([john, genesis], {
      ptxprintPath: bin,
      keepTempDir: false,
      timeoutMs: 900_000,
      paperSize: 'A5',
    });

    expect(bookCodes).toEqual(['JHN', 'GEN']);
    expect(bookCode).toBe('JHN');
    expect(pdf.slice(0, 5).toString('ascii')).toBe('%PDF-');
  }, 900_000);
});

describeIntegration('usfmToPdf + cfgOverrides integration', () => {
  it('accepts cfgOverrides without crashing and produces a valid PDF', async () => {
    const minimal =
      '\\id JHN\n' +
      '\\ide UTF-8\n' +
      '\\h John\n' +
      '\\mt1 John\n' +
      '\\c 1\n' +
      '\\p\n' +
      '\\v 1 In the beginning was the Word.\n';

    const { pdf, bookCode } = await usfmToPdf(minimal, {
      ptxprintPath: bin,
      keepTempDir: false,
      timeoutMs: 900_000,
      paperSize: 'A5',
      cfgOverrides: {
        document: { sectionheads: 'False' },
        notes: { includefootnotes: 'False', includexrefs: 'False' },
      },
    });

    expect(bookCode).toBe('JHN');
    expect(pdf.slice(0, 5).toString('ascii')).toBe('%PDF-');
  }, 900_000);
});

if (gate && !bin) {
  // eslint-disable-next-line no-console
  console.info(
    'PTXprint integration: enabled (PTXPRINT_INTEGRATION=1 or valid PTXPRINT_BIN) but `ptxprint` was not found on PATH or standard install paths.',
  );
}
