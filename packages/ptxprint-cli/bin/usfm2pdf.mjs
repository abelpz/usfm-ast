#!/usr/bin/env node
/**
 * usfm2pdf — Convert USFM files to PDF via @usfm-tools/ptxprint-driver.
 *
 * All RenderOptions are exposed as CLI flags that map 1-to-1 to the keys
 * PTXprint understands in ptxprint.cfg. The `--cfg-set` and `--cfg-file`
 * escapes expose the raw cfg layer for anything not covered by typed flags.
 *
 * Usage:
 *   usfm2pdf [options] <file.usfm> [file2.usfm ...]
 *   usfm2pdf --fixture tit
 *   usfm2pdf --fixture jhn,tit -o combined.pdf
 */

import { parseArgs } from 'node:util';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Lazy-import driver so --help works without PTXprint installed ─────────────
let _driver = null;
async function driver() {
  if (!_driver) _driver = await import('@usfm-tools/ptxprint-driver');
  return _driver;
}

// ── Built-in fixtures ─────────────────────────────────────────────────────────
const FIXTURES_DIR = join(__dirname, '..', 'fixtures');
const FIXTURE_ALIASES = {
  tit: 'tit.usfm',
  jhn: 'jhn.usfm',
};

// ── ANSI helpers (no external deps) ──────────────────────────────────────────
const tty = process.stderr.isTTY;
const bold  = (s) => tty ? `\x1b[1m${s}\x1b[0m`  : s;
const green = (s) => tty ? `\x1b[32m${s}\x1b[0m` : s;
const red   = (s) => tty ? `\x1b[31m${s}\x1b[0m` : s;
const cyan  = (s) => tty ? `\x1b[36m${s}\x1b[0m` : s;
const dim   = (s) => tty ? `\x1b[2m${s}\x1b[0m`  : s;
const yellow= (s) => tty ? `\x1b[33m${s}\x1b[0m` : s;

// ── Help text ─────────────────────────────────────────────────────────────────
const HELP = `\
${bold('usfm2pdf')} — Convert USFM files to PDF via PTXprint

${bold('USAGE')}
  usfm2pdf [options] <file.usfm> [file2.usfm ...]
  usfm2pdf --fixture tit
  usfm2pdf --fixture jhn,tit -o combined.pdf

${bold('BUILT-IN FIXTURES')} ${dim('(for quick testing without your own files)')}
  tit     Titus — 3-chapter Pauline epistle
  jhn     John chapter 1

${bold('OUTPUT')}
  -o, --output <path>             Output PDF path
                                  ${dim('[default: <book>_ptxp.pdf in current directory]')}

${bold('PAGE LAYOUT')}
  --paper-size <size>             A4 | A5 | USletter | WxH (mm, e.g. 148x210)
                                  ${dim('[default: A4]')}
  --columns <n>                   1 or 2 body columns ${dim('[default: 1]')}
  --rtl                           Right-to-left page layout
  --margins-mm <n>                All-side margins in mm ${dim('[default: 12]')}
                                  Maps to ptxprint.cfg paper/margins
  --top-margin-mm <n>             Top margin override in mm
                                  Maps to ptxprint.cfg paper/topmargin
  --bottom-margin-mm <n>          Bottom margin override in mm
                                  Maps to ptxprint.cfg paper/bottommargin
  --mirror-margins                Mirror inner/outer margins for double-sided
                                  printing (header and footer also mirror).
                                  Maps to ptxprint.cfg header/mirrorlayout
  --binding-gutter <mm>           Extra margin in mm added on the binding (inner)
                                  side of each page, on top of --margins.
                                  Use this for saddle-stitch / perfect binding so
                                  that inner margins are wider than outer ones.
                                  Example: --margins 12 --binding-gutter 6
                                    → outer margin 12 mm, inner margin 18 mm
                                  Automatically enables --mirror-margins.
                                  Maps to ptxprint.cfg paper/gutter + paper/ifaddgutter

${bold('TYPOGRAPHY')}
  --font-family <name>            Body font family ${dim('[default: DejaVu Serif (bundled)]')}
                                  Maps to ptxprint.cfg document/fontregular
  --font-size-pt <n>              Body font size in points ${dim('[default: 12]')}
                                  Maps to ptxprint.cfg paper/fontfactor
  --line-spacing-pt <n>           Baseline-to-baseline spacing in points ${dim('[default: 15]')}
                                  Maps to ptxprint.cfg paragraph/linespacing
  --no-justify                    Disable text justification (on by default)
                                  Maps to ptxprint.cfg paragraph/ifjustify
  --hyphenate                     Enable hyphenation (off by default)
                                  Maps to ptxprint.cfg paragraph/ifhyphenate
  --lang-iso <code>               ISO 639 language code for Settings.xml ${dim('[default: en]')}

${bold('PAGE NUMBERS')}
  --page-numbers <mode>           Where to print page numbers:
                                    none           — suppress all page numbers
                                    footer-center  — centered footer ${dim('[default]')}
                                    header-center  — centered header
                                    header-outer   — outer edge of header
                                                     (implies --mirror-margins)
                                  Maps to ptxprint.cfg header/hdrcenter etc.
  --start-page-num <n>            Number assigned to the first page ${dim('[default: 1]')}
                                  Maps to ptxprint.cfg document/startpagenum
  --header-rule-mm <n>            Thickness of horizontal rule below header (mm)
                                  Maps to ptxprint.cfg paper/rulegap + header/ifrhrule

${bold('CONTENT TOGGLES')}
  --footnotes / --no-footnotes    Include or exclude footnotes
                                  Maps to ptxprint.cfg notes/includefootnotes
  --cross-refs / --no-cross-refs  Include or exclude cross-references
                                  Maps to ptxprint.cfg notes/includexrefs
  --section-heads / --no-section-heads
                                  Show or hide section headings
                                  Maps to ptxprint.cfg document/sectionheads
  --chapter-numbers / --no-chapter-numbers
                                  Show or hide chapter numbers
                                  Maps to ptxprint.cfg document/ifshowchapternums
  --verse-numbers / --no-verse-numbers
                                  Show or hide verse numbers
                                  Maps to ptxprint.cfg document/ifshowversenums

${bold('COVER IMAGE')}
  --cover-image <path>            JPEG or PNG image for the front cover (right slot of
                                  the cover spread when --pages-per-spread 2).
  --back-cover-image <path>       JPEG or PNG image for the back cover (left slot of
                                  the cover spread). Only used with --pages-per-spread 2.
                                  When omitted the back cover slot is left blank.
                                  Maps to RenderOptions.coverImagePath

${bold('BOOKLET / IMPOSITION')}
  --pages-per-spread <n>          1 = normal pages (default), 2 = printer's spreads
                                  (two content pages per physical sheet, saddle-stitch order)
                                  Maps to ptxprint.cfg finishing/pgsperspread
  --sheet-size <size>             Physical sheet size for imposition (what the printer loads).
                                  A4 | A5 | USletter | WxH (mm, e.g. 210x297)
                                  Only relevant when --pages-per-spread 2
                                  ${dim('[default: A4 when pages-per-spread=2]')}
                                  Maps to ptxprint.cfg finishing/sheetsize
  --sheets-per-signature <n>      Sheets per saddle-stitch / perfect-bind signature.
                                  0 = single signature (all pages), 4 = 4-sheet signatures
                                  Maps to ptxprint.cfg finishing/sheetsinsigntr
  --fold-cut-margin-mm <n>        Extra margin in mm at the fold/cut line ${dim('[default: 0]')}
                                  Maps to ptxprint.cfg finishing/foldcutmargin
  --fold-first                    Fold before cut (changes imposition order within signature)
                                  Maps to ptxprint.cfg finishing/foldfirst

${bold('ADVANCED — RAW CFG ACCESS')}
  --cfg-set <section/key=value>   Set an arbitrary ptxprint.cfg key (repeatable).
                                  Use True/False for boolean keys.
                                  e.g. --cfg-set notes/includefootnotes=True
                                       --cfg-set paragraph/fontleadingfactor=1.1
  --cfg-file <path>               Load raw INI overrides from a file.
                                  Merged after --cfg-set; typed flags applied first.
                                  Example file:
                                    [document]
                                    sectionheads = True
                                    [notes]
                                    includefootnotes = True

${bold('PTXPRINT CLI PASS-THROUGH')} ${dim('(forwarded verbatim to the ptxprint executable)')}
  -f, --font-path <dir>           Font search directory (repeatable)
                                  PTXprint -f / --fontpath
  --pdf-version <n>               PDF version to write (e.g. 14 = PDF 1.4, 17 = PDF 1.7)
                                  PTXprint -V / --pdfversion ${dim('[default: 14]')}
  --xetex-timeout <n>             XeTeX runtime timeout in seconds
                                  PTXprint --timeout (distinct from --timeout-ms)
  --xetex-runs <n>                Maximum XeTeX re-runs
                                  PTXprint -R / --runs
  --quiet                         Suppress PTXprint splash / limit output
                                  PTXprint -q / --quiet
  --no-internet                   Disable all internet access during run
                                  PTXprint -N / --nointernet
  --define <component=value>      Set a PTXprint UI component value (repeatable)
                                  PTXprint -D / --define
                                  e.g. --define "Paper/pagesize=A5"
  --ptx-debug                     Enable PTXprint debug output
                                  PTXprint --debug
  --log-level <level>             PTXprint logging level: DEBUG|INFO|WARN|ERROR
                                  PTXprint -l / --logging
  --log-file <path>               PTXprint log file path (or "none")
                                  PTXprint --logfile
  --macros-dir <dir>              Directory containing TeX macros (paratext2.tex)
                                  PTXprint -m / --macros
  --extras <flags>                Special flags string forwarded to PTXprint
                                  PTXprint -z / --extras

${bold('PROCESS')}
  --ptxprint-path <path>          Explicit path to ptxprint executable
                                  (auto-detected from PATH or PTXPRINT_BIN env var)
  --timeout-ms <n>                Node spawn wall-clock timeout in ms ${dim('[default: 600000]')}
  --keep-temp                     Keep scaffold temp directory on success
                                  (path printed to stderr — useful for debugging cfg)
  --verbose                       Stream full PTXprint log to stderr
  -h, --help                      Show this help and exit
  -V, --version                   Show version and exit

${bold('ENVIRONMENT VARIABLES')}
  PTXPRINT_BIN         Path to ptxprint executable (fallback when not on PATH)
  PTXPRINT_BODY_FONT   Process-level font override (supersedes --font-family)

${bold('EXAMPLES')}
  ${dim('# Single book from a USFM file')}
  usfm2pdf my-book.usfm -o my-book.pdf

  ${dim('# Built-in fixture with custom layout')}
  usfm2pdf --fixture tit --paper-size A5 --columns 2 -o titus-a5-2col.pdf

  ${dim('# Multi-book combined PDF')}
  usfm2pdf john.usfm genesis.usfm --paper-size A5 -o jhn-gen.pdf

  ${dim('# Multi-fixture (comma-separated)')}
  usfm2pdf --fixture jhn,tit -o jhn-tit.pdf

  ${dim('# Typography tuning')}
  usfm2pdf --fixture tit --font-family "Charis SIL" --font-size-pt 11 --line-spacing-pt 14

  ${dim('# Page numbering in outer header (double-sided)')}
  usfm2pdf --fixture tit --page-numbers header-outer --mirror-margins -o tit-ds.pdf

  ${dim('# Enable footnotes and cross-refs via typed flags')}
  usfm2pdf --fixture tit --footnotes --cross-refs -o tit-notes.pdf

  ${dim('# Set a raw ptxprint.cfg key')}
  usfm2pdf --fixture tit --cfg-set paragraph/fontleadingfactor=1.2 -o tit-leading.pdf

  ${dim('# Load a full INI override file')}
  usfm2pdf --fixture tit --cfg-file my-overrides.ini -o tit-custom.pdf

  ${dim('# Debug: keep temp dir to inspect generated ptxprint.cfg')}
  usfm2pdf --fixture tit --keep-temp --verbose -o tit-debug.pdf

  ${dim('# Single column with saddle-stitch imposition')}
  usfm2pdf --fixture jhn --paper-size A5 --columns 1 \\
    --pages-per-spread 2 --sheet-size A4 --sheets-per-signature 0 \\
    -o jhn-booklet.pdf

  ${dim('# Booklet with front cover only (back cover slot left blank)')}
  usfm2pdf --fixture jhn,tit --paper-size A5 --columns 1 \\
    --pages-per-spread 2 --sheet-size A4 \\
    --cover-image /path/to/front-cover.jpg \\
    -o booklet-cover.pdf

  ${dim('# Booklet with both front AND back cover images')}
  usfm2pdf --fixture jhn,tit --paper-size A5 --columns 1 \\
    --pages-per-spread 2 --sheet-size A4 \\
    --cover-image /path/to/front-cover.jpg \\
    --back-cover-image /path/to/back-cover.jpg \\
    -o booklet-full-cover.pdf
`;

// ── parseArgs ─────────────────────────────────────────────────────────────────
let parsed;
try {
  parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      // output
      output:               { type: 'string',  short: 'o' },
      // fixtures
      fixture:              { type: 'string' },
      // page layout
      'paper-size':         { type: 'string',  default: 'A4' },
      columns:              { type: 'string',  default: '1' },
      rtl:                  { type: 'boolean', default: false },
      'margins-mm':         { type: 'string' },
      'top-margin-mm':      { type: 'string' },
      'bottom-margin-mm':   { type: 'string' },
      'mirror-margins':     { type: 'boolean', default: false },
      'binding-gutter':     { type: 'string' },
      // typography
      'font-family':        { type: 'string' },
      'font-size-pt':       { type: 'string' },
      'line-spacing-pt':    { type: 'string' },
      'no-justify':         { type: 'boolean', default: false },
      hyphenate:            { type: 'boolean', default: false },
      'lang-iso':           { type: 'string',  default: 'en' },
      // page numbers
      'page-numbers':       { type: 'string' },
      'start-page-num':     { type: 'string' },
      'header-rule-mm':     { type: 'string' },
      // content toggles (on / off pairs)
      footnotes:            { type: 'boolean' },
      'no-footnotes':       { type: 'boolean' },
      'cross-refs':         { type: 'boolean' },
      'no-cross-refs':      { type: 'boolean' },
      'section-heads':      { type: 'boolean' },
      'no-section-heads':   { type: 'boolean' },
      'chapter-numbers':    { type: 'boolean' },
      'no-chapter-numbers': { type: 'boolean' },
      'verse-numbers':      { type: 'boolean' },
      'no-verse-numbers':   { type: 'boolean' },
      // cover image
      'cover-image':            { type: 'string' },
      'back-cover-image':       { type: 'string' },
      // booklet / imposition
      'pages-per-spread':       { type: 'string' },
      'sheet-size':             { type: 'string' },
      'sheets-per-signature':   { type: 'string' },
      'fold-cut-margin-mm':     { type: 'string' },
      'fold-first':             { type: 'boolean', default: false },
      // advanced cfg
      'cfg-set':            { type: 'string',  multiple: true },
      'cfg-file':           { type: 'string' },
      // PTXprint CLI pass-through
      'font-path':          { type: 'string',  short: 'f', multiple: true },
      'pdf-version':        { type: 'string' },
      'xetex-timeout':      { type: 'string' },
      'xetex-runs':         { type: 'string' },
      quiet:                { type: 'boolean', default: false },
      'no-internet':        { type: 'boolean', default: false },
      define:               { type: 'string',  multiple: true },
      'ptx-debug':          { type: 'boolean', default: false },
      'log-level':          { type: 'string' },
      'log-file':           { type: 'string' },
      'macros-dir':         { type: 'string' },
      extras:               { type: 'string' },
      // process
      'ptxprint-path':      { type: 'string' },
      'timeout-ms':         { type: 'string' },
      'keep-temp':          { type: 'boolean', default: false },
      verbose:              { type: 'boolean', default: false },
      // meta
      help:                 { type: 'boolean', short: 'h', default: false },
      version:              { type: 'boolean', short: 'V', default: false },
    },
    allowPositionals: true,
    strict: false,
  });
} catch (err) {
  process.stderr.write(red('Error: ') + err.message + '\n');
  process.exit(1);
}

const { values: v, positionals } = parsed;

if (v.help) {
  process.stdout.write(HELP + '\n');
  process.exit(0);
}

if (v.version) {
  const pkg = JSON.parse(await readFile(join(__dirname, '..', 'package.json'), 'utf8'));
  process.stdout.write(pkg.version + '\n');
  process.exit(0);
}

// ── Collect input USFM paths ──────────────────────────────────────────────────
const inputPaths = positionals.map((p) => resolve(p));

if (v.fixture) {
  for (const name of v.fixture.split(',').map((s) => s.trim())) {
    const alias = FIXTURE_ALIASES[name];
    if (!alias) {
      process.stderr.write(
        red(`Unknown fixture "${name}". Available: ${Object.keys(FIXTURE_ALIASES).join(', ')}\n`),
      );
      process.exit(1);
    }
    inputPaths.push(join(FIXTURES_DIR, alias));
  }
}

if (!inputPaths.length) {
  process.stderr.write(
    red('Error: ') + 'Provide at least one USFM file or use --fixture <name>.\n' +
    dim('Run `usfm2pdf --help` for usage.\n'),
  );
  process.exit(1);
}

// Read all USFM texts
const usfms = [];
for (const p of inputPaths) {
  if (!existsSync(p)) {
    process.stderr.write(red('Error: ') + `File not found: ${p}\n`);
    process.exit(1);
  }
  usfms.push(await readFile(p, 'utf8'));
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function parsePaperSize(s) {
  if (['A4', 'A5', 'USletter'].includes(s)) return s;
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i.exec(s);
  if (m) return { widthMm: parseFloat(m[1]), heightMm: parseFloat(m[2]) };
  process.stderr.write(
    red(`Invalid --paper-size "${s}". `) +
    'Use A4, A5, USletter, or WxH in mm (e.g. 148x210).\n',
  );
  process.exit(1);
}

/** Return true/false/undefined for a paired on/off flag set. */
function boolToggle(onKey, offKey) {
  if (v[onKey])  return true;
  if (v[offKey]) return false;
  return undefined;
}

/** Minimal INI parser — same format as ptxprint.cfg. */
function parseIni(text) {
  const out = {};
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sec = /^\[([^\]]+)\]$/.exec(line);
    if (sec) { cur = sec[1].toLowerCase().trim(); out[cur] ??= {}; continue; }
    if (cur) {
      const eq = line.indexOf('=');
      if (eq > 0) out[cur][line.slice(0, eq).trim()] = line.slice(eq + 1).trim();
    }
  }
  return out;
}

function mergeSections(a, b) {
  const out = { ...a };
  for (const [sec, keys] of Object.entries(b)) {
    out[sec] = { ...(out[sec] ?? {}), ...keys };
  }
  return out;
}

// ── Build cfgOverrides ────────────────────────────────────────────────────────
let cfgOverrides = {};

for (const entry of (v['cfg-set'] ?? [])) {
  const slash = entry.indexOf('/');
  const eq    = entry.indexOf('=');
  if (slash < 1 || eq <= slash) {
    process.stderr.write(
      red(`Invalid --cfg-set "${entry}". `) + 'Expected format: section/key=value\n',
    );
    process.exit(1);
  }
  const sec = entry.slice(0, slash).toLowerCase();
  const key = entry.slice(slash + 1, eq).trim();
  const val = entry.slice(eq + 1);
  cfgOverrides = mergeSections(cfgOverrides, { [sec]: { [key]: val } });
}

if (v['cfg-file']) {
  const cfgFilePath = resolve(v['cfg-file']);
  if (!existsSync(cfgFilePath)) {
    process.stderr.write(red(`--cfg-file not found: ${cfgFilePath}\n`));
    process.exit(1);
  }
  cfgOverrides = mergeSections(cfgOverrides, parseIni(await readFile(cfgFilePath, 'utf8')));
}

// ── Build RenderOptions (maps flags → driver API → ptxprint.cfg keys) ─────────
const opts = {
  // Page layout
  paperSize:    parsePaperSize(v['paper-size']),
  columns:      parseInt(v.columns ?? '1', 10) === 2 ? 2 : 1,
  rtl:          v.rtl || undefined,
  mirrorMargins: v['mirror-margins'] || undefined,
  // Typography
  langIso:      v['lang-iso'],
  // Process
  ptxprintPath: v['ptxprint-path'],
  keepTempDir:  v['keep-temp'] || undefined,
  onLog:        v.verbose ? (c) => process.stderr.write(c) : undefined,
};

// Numeric layout options — only set when flag is present
if (v['margins-mm'])       opts.marginsMm       = parseFloat(v['margins-mm']);
if (v['top-margin-mm'])    opts.topMarginMm     = parseFloat(v['top-margin-mm']);
if (v['bottom-margin-mm']) opts.bottomMarginMm  = parseFloat(v['bottom-margin-mm']);
if (v['binding-gutter'])   opts.bindingGutterMm = parseFloat(v['binding-gutter']);
if (v['header-rule-mm'])   opts.headerRuleMm    = parseFloat(v['header-rule-mm']);
if (v['start-page-num'])   opts.startPageNum    = parseInt(v['start-page-num'], 10);
if (v['timeout-ms'])       opts.timeoutMs       = parseInt(v['timeout-ms'], 10);

// Typography
if (v['font-family'])    opts.fontFamily    = v['font-family'];
if (v['font-size-pt'])   opts.fontSizePt    = parseFloat(v['font-size-pt']);
if (v['line-spacing-pt']) opts.lineSpacingPt = parseFloat(v['line-spacing-pt']);
if (v['no-justify'])     opts.justify       = false;
if (v.hyphenate)         opts.hyphenate     = true;

// Page numbers
if (v['page-numbers'])   opts.pageNumbers   = v['page-numbers'];

// Content toggles — only populate if either side of the pair is explicitly set
const footnotes     = boolToggle('footnotes',      'no-footnotes');
const crossRefs     = boolToggle('cross-refs',     'no-cross-refs');
const sectionHeads  = boolToggle('section-heads',  'no-section-heads');
const chapterNums   = boolToggle('chapter-numbers','no-chapter-numbers');
const verseNums     = boolToggle('verse-numbers',  'no-verse-numbers');

if (footnotes    !== undefined) opts.footnotes      = footnotes;
if (crossRefs    !== undefined) opts.crossRefs      = crossRefs;
if (sectionHeads !== undefined) opts.sectionHeads   = sectionHeads;
if (chapterNums  !== undefined) opts.chapterNumbers = chapterNums;
if (verseNums    !== undefined) opts.verseNumbers   = verseNums;

// ── Booklet / imposition ──────────────────────────────────────────────────────
if (v['pages-per-spread']) {
  const n = parseInt(v['pages-per-spread'], 10);
  if (n === 1 || n === 2) opts.pagesPerSpread = n;
  else {
    process.stderr.write(red(`--pages-per-spread must be 1 or 2, got "${v['pages-per-spread']}"\n`));
    process.exit(1);
  }
}
if (v['sheet-size'])           opts.sheetSize          = parsePaperSize(v['sheet-size']);
if (v['sheets-per-signature']) opts.sheetsPerSignature = parseInt(v['sheets-per-signature'], 10);
if (v['fold-cut-margin-mm'])   opts.foldCutMarginMm    = parseFloat(v['fold-cut-margin-mm']);
if (v['fold-first'])           opts.foldFirst          = true;

// Cover images (front and back)
if (v['cover-image']) {
  const coverPath = resolve(v['cover-image']);
  if (!existsSync(coverPath)) {
    process.stderr.write(red(`--cover-image not found: ${coverPath}\n`));
    process.exit(1);
  }
  opts.coverImagePath = coverPath;
}
if (v['back-cover-image']) {
  const backPath = resolve(v['back-cover-image']);
  if (!existsSync(backPath)) {
    process.stderr.write(red(`--back-cover-image not found: ${backPath}\n`));
    process.exit(1);
  }
  opts.backCoverImagePath = backPath;
}

// Raw cfg overrides (lowest priority; driver protected-keys still win)
if (Object.keys(cfgOverrides).length) opts.cfgOverrides = cfgOverrides;

// ── PTXprint CLI pass-through ─────────────────────────────────────────────────
if (v['font-path']?.length)   opts.fontPaths      = v['font-path'].map((p) => resolve(p));
if (v['pdf-version'])         opts.pdfVersion     = parseInt(v['pdf-version'], 10);
if (v['xetex-timeout'])       opts.xetexTimeoutSec = parseInt(v['xetex-timeout'], 10);
if (v['xetex-runs'])          opts.xetexRuns      = parseInt(v['xetex-runs'], 10);
if (v.quiet)                  opts.quiet          = true;
if (v['no-internet'])         opts.noInternet     = true;
if (v.define?.length) {
  opts.ptxDefine = {};
  for (const entry of v.define) {
    const eq = entry.indexOf('=');
    if (eq < 1) {
      process.stderr.write(red(`Invalid --define "${entry}". Expected format: component=value\n`));
      process.exit(1);
    }
    opts.ptxDefine[entry.slice(0, eq)] = entry.slice(eq + 1);
  }
}
if (v['ptx-debug'])           opts.debugMode      = true;
if (v['log-level'])           opts.logLevel       = v['log-level'];
if (v['log-file'])            opts.logFile        = resolve(v['log-file']);
if (v['macros-dir'])          opts.macrosDir      = resolve(v['macros-dir']);
if (v.extras)                 opts.extras         = v.extras;

// ── Run ───────────────────────────────────────────────────────────────────────
const bookLabel = usfms.length === 1 ? '1 book' : `${usfms.length} books`;
process.stderr.write(cyan('→') + ` Converting ${bookLabel} to PDF…\n`);
if (v.verbose) {
  process.stderr.write(dim('  PTXprint log:\n'));
}

const startMs = Date.now();
let result;

try {
  const { usfmToPdf, usfmsToPdf } = await driver();
  result = usfms.length === 1
    ? await usfmToPdf(usfms[0], opts)
    : await usfmsToPdf(usfms, opts);
} catch (err) {
  const { PtxprintNotFoundError, PtxprintExitError } = await driver();

  if (err instanceof PtxprintNotFoundError) {
    process.stderr.write(
      red('PTXprint not found.\n') +
      'Install it and add to PATH, or set the PTXPRINT_BIN environment variable,\n' +
      'or pass --ptxprint-path <path>.\n' +
      dim('Download: https://software.sil.org/ptxprint/\n'),
    );
    process.exit(1);
  }

  if (err instanceof PtxprintExitError) {
    process.stderr.write(red('PTXprint failed.\n'));
    if (err.tempDir && v['keep-temp']) {
      process.stderr.write(yellow('Scaffold dir: ') + err.tempDir + '\n');
    }
    process.stderr.write(err.message + '\n');
    if (!v.verbose) {
      process.stderr.write(dim('Re-run with --verbose to see the full PTXprint log.\n'));
    }
    process.exit(1);
  }

  throw err;
}

// ── Write output ──────────────────────────────────────────────────────────────
const bookCodes = result.bookCodes ?? [result.bookCode];
let outPath = v.output;
if (!outPath) {
  const name = bookCodes.join('-').toLowerCase();
  outPath = resolve(`${name}_ptxp.pdf`);
}

await writeFile(outPath, result.pdf);

const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
const sizeKb  = (result.pdf.length / 1024).toFixed(0);
const books   = bookCodes.join(', ');

process.stderr.write(
  green('✓') + ` PDF written: ${bold(outPath)}\n` +
  dim(`  books: ${books}  |  ${sizeKb} KB  |  ${elapsed}s\n`),
);

if (v['keep-temp']) {
  process.stderr.write(dim(`  temp dir: ${result.tempDir}\n`));
}
