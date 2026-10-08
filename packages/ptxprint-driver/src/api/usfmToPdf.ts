import { randomBytes } from 'crypto';
import { mkdtemp } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';

import { ScriptureNormalizeError } from '../errors';
import { extractBookId } from '../normalize/extractBookId';
import { normalizeToUsfm } from '../normalize/normalizeToUsfm';
import { prependCoverPage } from '../normalize/prependCoverPage';
import { findPtxprint } from '../runner/findPtxprint';
import { runPtxprint } from '../runner/runPtxprint';
import { scaffoldProject } from '../scaffold/scaffoldProject';
import type { RenderOptions, RenderResult, ScriptureInput } from '../types';
import { DEFAULT_CONFIG_ID } from '../types';
import { withResolvedBodyFont } from '../withResolvedBodyFont';

/** Single or array of scripture inputs accepted by {@link usfmToPdf}. */
export type UsfmInput = ScriptureInput | string | Array<ScriptureInput | string>;

/** Return type always includes the full ordered list of book codes. */
export type UsfmToPdfResult = RenderResult & { bookCodes: string[] };

function makeProjectId(): string {
  return `P${randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * Convert **one or more** scripture books to a single PDF via PTXprint.
 *
 * Pass a single input (USFM string or `ScriptureInput`) for a single-book PDF,
 * or an array to combine multiple books into one PDF in the order supplied.
 *
 * @param input - A single book or an array of books (USFM string or
 *                typed `ScriptureInput` with `format: 'usfm' | 'usj' | 'usx'`).
 * @param opts  - Rendering options: paper size, font, imposition, covers, etc.
 * @returns `{ pdf, log, bookCode, bookCodes, tempDir }`:
 *          - `pdf`       — raw PDF as a Node.js `Buffer`
 *          - `bookCode`  — first (or only) book's 3-letter code
 *          - `bookCodes` — full ordered list of book codes in the PDF
 *          - `log`       — PTXprint / XeTeX log text
 *          - `tempDir`   — path to the scaffold temp directory
 *
 * @throws {PtxprintNotFoundError}   When `ptxprint` is not on PATH and `PTXPRINT_BIN` is unset.
 * @throws {PtxprintExitError}       When PTXprint exits non-zero or the expected PDF is missing.
 * @throws {ScriptureNormalizeError} When any input cannot be converted to USFM, or the array is empty.
 *
 * @example Single book
 * ```ts
 * const { pdf, bookCode } = await usfmToPdf('\\id JHN\n\\c 1\n\\p\n\\v 1 In the beginning…\n', {
 *   paperSize: 'A5',
 *   fontFamily: 'Charis SIL',
 * });
 * fs.writeFileSync('john.pdf', pdf);
 * // bookCode → 'JHN'
 * ```
 *
 * @example Multiple books combined
 * ```ts
 * const { pdf, bookCodes } = await usfmToPdf([johnUsfm, titusUsfm], {
 *   paperSize: 'A5',
 *   columns: 1,
 *   pagesPerSpread: 2,
 *   sheetSize: 'A4',
 *   coverImagePath:    '/path/to/front.jpg',
 *   backCoverImagePath:'/path/to/back.jpg',
 * });
 * // bookCodes → ['JHN', 'TIT']
 * ```
 */
export async function usfmToPdf(
  input: UsfmInput,
  opts: RenderOptions = {},
): Promise<UsfmToPdfResult> {
  // ── Normalise input to an array of { bookCode, usfmText } ──────────────────
  const inputs = Array.isArray(input) ? input : [input];

  if (inputs.length === 0) {
    throw new ScriptureNormalizeError('usfmToPdf requires at least one scripture input.');
  }

  const books = inputs.map((src) => {
    const usfmText = normalizeToUsfm(src);
    const bookCode = extractBookId(usfmText);
    return { bookCode, usfmText };
  });

  const bookCodes = books.map((b) => b.bookCode);
  const primaryBookCode = bookCodes[0];

  // ── Scaffold ───────────────────────────────────────────────────────────────
  const workspaceTempDir = await mkdtemp(join(tmpdir(), 'ptxdrv-'));
  const projectId = makeProjectId();

  await scaffoldProject({
    projectsRoot: workspaceTempDir,
    projectId,
    books,
    langIso: opts.langIso ?? 'en',
    configId: DEFAULT_CONFIG_ID,
    render: withResolvedBodyFont(opts),
  });

  // ── Run PTXprint ───────────────────────────────────────────────────────────
  const bin = findPtxprint({ explicitPath: opts.ptxprintPath });
  let { pdf, log } = await runPtxprint({
    bin,
    projectsRoot: workspaceTempDir,
    projectId,
    bookCode:        primaryBookCode,
    bookCodes,
    configId:        DEFAULT_CONFIG_ID,
    workspaceTempDir,
    pagesPerSpread:  opts.pagesPerSpread,
    fontPaths:       opts.fontPaths,
    pdfVersion:      opts.pdfVersion,
    xetexTimeoutSec: opts.xetexTimeoutSec,
    xetexRuns:       opts.xetexRuns,
    quiet:           opts.quiet,
    noInternet:      opts.noInternet,
    ptxDefine:       opts.ptxDefine,
    debugMode:       opts.debugMode,
    logLevel:        opts.logLevel,
    logFile:         opts.logFile,
    macrosDir:       opts.macrosDir,
    extras:          opts.extras,
    onLog:           opts.onLog,
    signal:          opts.signal,
    timeoutMs:       opts.timeoutMs,
    keepTempDir:     opts.keepTempDir,
  });

  // ── Cover spread post-processing ───────────────────────────────────────────
  if (opts.coverImagePath != null) {
    pdf = Buffer.from(
      await prependCoverPage(pdf, opts.coverImagePath, opts.pagesPerSpread, opts.backCoverImagePath),
    );
  }

  return {
    pdf,
    log,
    bookCode: primaryBookCode,
    bookCodes,
    tempDir: workspaceTempDir,
  };
}
