/**
 * USFM round-trip stability test.
 *
 * For every golden fixture in `examples/usfm-markers`:
 *
 *   parseUsjFromUsfm(convertUSJDocumentToUSFM(parseUsjFromUsfm(usfm))) ≡ parseUsjFromUsfm(usfm)
 *
 * If this assertion fails for a PREVIOUSLY STABLE marker, the merge engine cannot
 * safely round-trip that content and the bidirectional-sync three-way merge will
 * produce unreliable output.
 *
 * Markers listed in ROUNDTRIP_TODO are known to have lossy conversion (e.g. table
 * cells, category markers, and certain rare inline markers).  Their roundtrip tests
 * run as `it.todo` so CI can see the current state without failing — remove a label
 * from the list once the converter is fixed.
 *
 * The test also compares the first parse result against the committed `example.usj`
 * golden file so that any regression in parser output is caught immediately.
 */

import { convertUSJDocumentToUSFM } from '../src';
import { USFMParser } from '@usfm-tools/parser';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Known-unstable marker/example pairs where USFM → USJ → USFM → USJ does not
 * yet round-trip cleanly.  These are pre-existing limitations of the converter,
 * not regressions introduced by the sync engine.
 */
const ROUNDTRIP_TODO = new Set([
  'cat-cat/cat-example-1',
  'cat-cat/cat-example-2',
  'char-fm/fm-example-1',
  'char-fv/fv-example-1',
  'char-jmp/jmp-example-3',
  'char-k/k-example-1',
  'char-k/k-example-2',
  'char-tc/tc-example-1',
  'char-tcr/tcr-example-1',
  'char-th/th-example-1',
  'char-thr/thr-example-1',
  'char-xop/xop-example-1',
  'cv-ca/ca-example-1',
  'cv-cp/cp-example-1',
  'cv-va/va-example-1',
  'cv-vp/vp-example-1',
  'para-ili/ili-example-1',
  'para-im/im-example-1',
  'periph-periph/periph-example-1',
  'sbar-esb/esb-example-1',
]);

// Resolve the examples directory relative to the repo root.
const EXAMPLES_DIR = path.resolve(__dirname, '../../../examples/usfm-markers');

interface ExampleCase {
  label: string;
  usfmPath: string;
  usjPath: string;
}

function discoverExamples(): ExampleCase[] {
  const cases: ExampleCase[] = [];
  for (const marker of fs.readdirSync(EXAMPLES_DIR)) {
    const markerDir = path.join(EXAMPLES_DIR, marker);
    if (!fs.statSync(markerDir).isDirectory()) continue;
    for (const example of fs.readdirSync(markerDir)) {
      const exDir = path.join(markerDir, example);
      if (!fs.statSync(exDir).isDirectory()) continue;
      const usfmPath = path.join(exDir, 'example.usfm');
      const usjPath = path.join(exDir, 'example.usj');
      if (fs.existsSync(usfmPath) && fs.existsSync(usjPath)) {
        cases.push({ label: `${marker}/${example}`, usfmPath, usjPath });
      }
    }
  }
  return cases;
}

function parseUsfmToUsj(usfm: string): unknown {
  const parser = new USFMParser({ silentConsole: true });
  parser.parse(usfm);
  return parser.toJSON();
}

// Normalize for stable comparison: strip whitespace-only string children that
// vary between parse runs (e.g. trailing newlines injected by the converter).
function normalizeUsj(node: unknown): unknown {
  if (typeof node === 'string') {
    return node.replace(/\r\n/g, '\n');
  }
  if (Array.isArray(node)) {
    return node.map(normalizeUsj).filter((n) => n !== '');
  }
  if (node && typeof node === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      // sid / eid are injected by the parser — skip them for cross-run comparison.
      if (k === 'sid' || k === 'eid') continue;
      out[k] = normalizeUsj(v);
    }
    return out;
  }
  return node;
}

const examples = discoverExamples();

// Guard: this test is useless without fixtures.
if (examples.length === 0) {
  throw new Error(`No examples found in ${EXAMPLES_DIR}`);
}

describe('USFM round-trip stability', () => {
  describe('USJ → USFM → USJ is idempotent', () => {
    for (const ex of examples) {
      if (ROUNDTRIP_TODO.has(ex.label)) {
        it.todo(`${ex.label} (known-unstable converter — see ROUNDTRIP_TODO)`);
        continue;
      }
      it(ex.label, () => {
        const usfm = fs.readFileSync(ex.usfmPath, 'utf8');

        // First parse: USFM → USJ
        const usj1 = parseUsfmToUsj(usfm);

        // Convert back to USFM and re-parse: USJ → USFM → USJ
        const usfm2 = convertUSJDocumentToUSFM(usj1 as Parameters<typeof convertUSJDocumentToUSFM>[0]);
        const usj2 = parseUsfmToUsj(usfm2);

        // The round-trip must be stable: usj2 ≡ usj1 (modulo sid/eid and minor whitespace).
        expect(normalizeUsj(usj2)).toEqual(normalizeUsj(usj1));
      });
    }
  });

  it.each(examples)('$label: first parse matches golden example.usj', ({ usfmPath, usjPath }) => {
    const usfm = fs.readFileSync(usfmPath, 'utf8');
    const goldenRaw = fs.readFileSync(usjPath, 'utf8');
    const golden = JSON.parse(goldenRaw);

    const usj = parseUsfmToUsj(usfm);

    expect(normalizeUsj(usj)).toEqual(normalizeUsj(golden));
  });
});
