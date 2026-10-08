/**
 * Raw PTXprint `ptxprint.cfg` shape: section name → key → value string.
 * Passed through `cfgOverrides` (merged after typed defaults; infrastructure keys re-applied last).
 */
export type PtxprintCfgSections = {
  [section: string]: Record<string, string> | undefined;
};

export interface RenderOptions {
  paperSize?: 'A4' | 'A5' | 'USletter' | { widthMm: number; heightMm: number };
  fontFamily?: string;
  /** Body font size in points (PTXprint `paper/fontfactor`). Defaults to 12. */
  fontSizePt?: number;
  /** Baseline skip in points (PTXprint `paragraph/linespacing`). Defaults to 15. */
  lineSpacingPt?: number;
  columns?: 1 | 2;
  rtl?: boolean;
  /** Page margins in mm (PTXprint `paper/margins`). Defaults to 12. */
  marginsMm?: number;
  /** @deprecated Use marginsMm instead. Numeric margin unit interpreted as mm. */
  marginUnitInches?: number;
  /**
   * Where to print page numbers.
   * - `'none'` — no page numbers anywhere
   * - `'footer-center'` — centered in footer (default)
   * - `'header-center'` — centered in header
   * - `'header-outer'` — outer edge of header (implies mirrorMargins)
   */
  pageNumbers?: 'none' | 'footer-center' | 'header-center' | 'header-outer';
  /** Page number of the first printed page. Defaults to 1. */
  startPageNum?: number;
  /**
   * Mirror inner/outer margins and header content for double-sided printing.
   * Maps to PTXprint `header/mirrorlayout`.
   * Also implied by `pageNumbers: 'header-outer'` and automatically set to
   * `true` when `bindingGutterMm` is provided.
   */
  mirrorMargins?: boolean;

  /**
   * Extra margin in mm added on the **binding (inner) side** of each page,
   * on top of the base `marginsMm` value.
   *
   * Used for saddle-stitch / perfect-binding layouts where the gutter area
   * needs more space because part of the margin is lost in the fold or glue.
   *
   * - `marginsMm` (e.g. 12 mm) → outer margin and non-binding side
   * - `bindingGutterMm` (e.g. 6 mm) → **additional** mm on binding side
   * - Effective inner margin = `marginsMm + bindingGutterMm` (e.g. 18 mm)
   *
   * Setting this automatically enables `paper/ifaddgutter = True` and
   * `header/mirrorlayout = True` (so the gutter alternates between left and
   * right on odd/even pages).
   *
   * Maps to PTXprint `paper/gutter` + `paper/ifaddgutter`.
   *
   * @example — Standard saddle-stitch with 12 mm outer / 18 mm inner:
   * ```ts
   * { marginsMm: 12, bindingGutterMm: 6 }
   * // outer margin = 12 mm, inner/binding margin = 12 + 6 = 18 mm
   * ```
   */
  bindingGutterMm?: number;
  /** Maps to `notes/includefootnotes` when set. */
  footnotes?: boolean;
  /** Maps to `notes/includexrefs` when set. */
  crossRefs?: boolean;
  /** Maps to `document/sectionheads` when set. */
  sectionHeads?: boolean;
  /** Maps to `document/ifshowchapternums` when set. */
  chapterNumbers?: boolean;
  /** Maps to `document/ifshowversenums` when set. */
  verseNumbers?: boolean;
  /** Maps to `paragraph/ifjustify` when set. Defaults to True in the typed baseline. */
  justify?: boolean;
  /** Maps to `paragraph/ifhyphenate` when set. Defaults to False in the typed baseline. */
  hyphenate?: boolean;
  /** Maps to `paper/topmargin` (mm). */
  topMarginMm?: number;
  /** Maps to `paper/bottommargin` (mm). */
  bottomMarginMm?: number;
  /**
   * Maps to `paper/rulegap` and turns on `header/ifrhrule` when set (mm).
   * Omit to keep defaults (no header rule).
   */
  headerRuleMm?: number;
  // ── Booklet / imposition (finishing section) ──────────────────────────

  /**
   * Number of content pages placed on each physical sheet.
   * - `1` — normal single-page output (default)
   * - `2` — **printer's spreads**: two content pages side-by-side on each
   *          physical sheet, imposed in saddle-stitch order.
   *
   * When set to `2`, also set `sheetSize` to the physical sheet the printer
   * uses (e.g. `'A4'` when your `paperSize` is `'A5'`).
   * Maps to PTXprint `finishing/pgsperspread`.
   */
  pagesPerSpread?: 1 | 2;

  /**
   * Physical sheet size for imposition (the paper the printer loads).
   * Only relevant when `pagesPerSpread = 2`.
   * Accepts the same values as `paperSize` plus a raw PTXprint string like
   * `'210mm, 297mm (A4)'`.
   * Maps to PTXprint `finishing/sheetsize`.
   */
  sheetSize?: 'A4' | 'A5' | 'USletter' | { widthMm: number; heightMm: number };

  /**
   * Number of physical sheets per **signature** (booklet section) for
   * saddle-stitch / perfect-binding imposition.
   * - `0` — single signature (all pages in one group, default)
   * - `4` — 4-sheet signatures: each section is 4 sheets folded = 16 content
   *          pages (for A5 content on A4 sheets)
   * Maps to PTXprint `finishing/sheetsinsigntr`.
   */
  sheetsPerSignature?: number;

  /**
   * Extra margin in mm added at the fold/cut line.
   * Typically `2`–`4` mm for saddle-stitch.
   * Maps to PTXprint `finishing/foldcutmargin`.
   */
  foldCutMarginMm?: number;

  /**
   * Fold the sheet before cutting (affects page ordering within a signature).
   * Usually `false` (cut before fold) for saddle-stitch booklets.
   * Maps to PTXprint `finishing/foldfirst`.
   */
  foldFirst?: boolean;

  // ── Cover image ─────────────────────────────────────────────────────────

  /**
   * Path to a JPEG or PNG image to use as the **book cover**.
   *
   * The image is included as a full-width, full-height figure placed BEFORE
   * chapter 1 (inside a `\periph Front Matter` block), so it participates in
   * the booklet imposition and lands on the right (recto) side when
   * `pagesPerSpread = 2`.
   *
   * The image is scaled to fill the text area of the page.  If you need a
   * fully bleed-to-edge cover (no margins), supply a pre-rendered cover PDF
   * via `cfgOverrides` or pass the cover separately.
   *
   * Supported formats: JPEG (`.jpg`, `.jpeg`), PNG (`.png`).
   */
  coverImagePath?: string;

  /**
   * Path to a JPEG or PNG image to place on the **back cover** (left slot of
   * the cover spread in a saddle-stitch 2-up booklet).
   * Only meaningful when `pagesPerSpread >= 2`.  When omitted the left slot
   * is left blank (white).
   */
  backCoverImagePath?: string;

  /**
   * Merge arbitrary PTXprint cfg sections after typed defaults.
   * Use `True`/`False` for checkbox keys read by Python `configparser.getboolean`.
   */
  cfgOverrides?: PtxprintCfgSections;

  // ── PTXprint CLI pass-through flags ──────────────────────────────────────

  /**
   * Additional font search directories passed as `-f <dir>` (repeatable).
   * Useful when your body font lives outside the system font paths.
   * Maps to PTXprint CLI `-f / --fontpath`.
   */
  fontPaths?: string[];

  /**
   * PDF version to write (e.g. `14` = PDF 1.4, `17` = PDF 1.7, `20` = PDF 2.0).
   * Defaults to PTXprint's own default (currently `14`).
   * Maps to PTXprint CLI `-V / --pdfversion`.
   */
  pdfVersion?: number;

  /**
   * XeTeX-level runtime timeout in **seconds** (separate from the Node spawn
   * timeout `timeoutMs` which is the outer wall-clock guard).
   * Maps to PTXprint CLI `--timeout`.
   */
  xetexTimeoutSec?: number;

  /**
   * Maximum number of XeTeX re-runs PTXprint will perform (e.g. for
   * page-position stabilisation). Defaults to PTXprint's own heuristic.
   * Maps to PTXprint CLI `-R / --runs`.
   */
  xetexRuns?: number;

  /**
   * Suppress PTXprint's splash screen and limit its stdout/stderr output.
   * Maps to PTXprint CLI `-q / --quiet`.
   */
  quiet?: boolean;

  /**
   * Disable all internet access during the PTXprint run (reproducible
   * offline builds, no external resource fetches).
   * Maps to PTXprint CLI `-N / --nointernet`.
   */
  noInternet?: boolean;

  /**
   * Set PTXprint UI component values directly (`component=value`), passed
   * as repeatable `-D` flags. Useful for overriding settings that do not
   * yet have a typed option.
   * Maps to PTXprint CLI `-D / --define`.
   * @example { "Paper/pagesize": "A5", "Document/columns": "2" }
   */
  ptxDefine?: Record<string, string>;

  /**
   * Enable PTXprint debug output.
   * Maps to PTXprint CLI `--debug`.
   */
  debugMode?: boolean;

  /**
   * Logging level for PTXprint's own logger.
   * Accepted values: `'DEBUG'`, `'INFO'`, `'WARN'`, `'ERROR'`, or a numeric level.
   * Maps to PTXprint CLI `-l / --logging`.
   */
  logLevel?: string;

  /**
   * Path to PTXprint's log file output. Use `'none'` to suppress the file.
   * Maps to PTXprint CLI `--logfile`.
   */
  logFile?: string;

  /**
   * Directory containing the ptx2pdf TeX macros (`paratext2.tex`).
   * Defaults to the macros bundled with the PTXprint installation.
   * Maps to PTXprint CLI `-m / --macros`.
   */
  macrosDir?: string;

  /**
   * Special flags string forwarded verbatim to PTXprint via `-z / --extras`.
   * Controls xdvipdfmx verbosity and other internal knobs.
   */
  extras?: string;

  // ── Node / process options ─────────────────────────────────────────────

  langIso?: string;
  ptxprintPath?: string;
  /** Node spawn wall-clock timeout in ms (default 600 000). */
  timeoutMs?: number;
  keepTempDir?: boolean;
  onLog?: (chunk: string) => void;
  signal?: AbortSignal;
}

export type ScriptureInput =
  | { format: 'usfm'; text: string }
  | { format: 'usj'; usj: unknown }
  | { format: 'usx'; xml: string };

export interface RenderResult {
  pdf: Buffer;
  log: string;
  bookCode: string;
  tempDir: string;
}

export const DEFAULT_CONFIG_ID = 'Default' as const;
