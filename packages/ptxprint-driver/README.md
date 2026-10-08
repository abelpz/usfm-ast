# @usfm-tools/ptxprint-driver

Node.js wrapper around the **PTXprint** CLI: scaffolds a temporary Paratext-shaped project (`Settings.xml`, `ptxprint.cfg`, correctly named `.usfm` files) from **USFM**, **USJ**, or **USX**, then runs PTXprint/XeTeX and returns the **PDF** as a `Buffer`.

---

## Contents

- [Prerequisites](#prerequisites)
- [Install](#install-monorepo)
- [Quick start](#quick-start)
- [API overview](#api-overview)
  - [`usfmToPdf` — single book](#usfmtopdf--single-book)
  - [`usfmsToPdf` — multi-book](#usfmstopdf--multi-book)
  - [`diglotToPdf` — parallel columns](#diglottpdf--parallel-columns)
- [Input formats](#input-formats)
- [RenderOptions reference](#renderoptions-reference)
  - [Page layout](#page-layout)
  - [Typography](#typography)
  - [Page numbers & header/footer](#page-numbers--headerfooter)
  - [Content toggles](#content-toggles)
  - [Booklet / imposition](#booklet--imposition)
  - [Cover images (front & back)](#cover-images-front--back)
  - [Advanced cfg override](#advanced-cfg-override)
  - [PTXprint CLI pass-through](#ptxprint-cli-pass-through)
  - [Runtime / process control](#runtime--process-control)
- [Environment variables](#environment-variables)
- [Errors](#errors)
- [Low-level exports](#low-level-exports)
- [Integration tests](#integration-tests-optional)
- [Development](#development)

---

## Prerequisites

- [PTXprint](https://software.sil.org/ptxprint/) installed, with `ptxprint` on `PATH`
  **or** set `PTXPRINT_BIN` to the full executable path.
  - Windows typical install: `C:\Program Files\PTXprint\ptxprint.exe`
- A working XeTeX installation (ships with PTXprint).

This package does **not** bundle TeX or PTXprint — it only orchestrates the CLI.

---

## Install (monorepo)

```bash
# from usfm-ast root
bun install
cd packages/ptxprint-driver
bun run build
```

---

## Quick start

```ts
import { usfmToPdf, PtxprintNotFoundError } from '@usfm-tools/ptxprint-driver';
import { writeFileSync } from 'fs';

const sample = `\\id JHN
\\ide UTF-8
\\h Gospel of John
\\mt1 John
\\c 1
\\p
\\v 1 In the beginning was the Word…
`;

try {
  // Single book — pass a string or ScriptureInput
  const { pdf, bookCode, bookCodes } = await usfmToPdf(sample, {
    paperSize: 'A5',
    fontFamily: 'Charis SIL', // default: bundled DejaVu Serif
    onLog: (c) => process.stderr.write(c),
  });
  writeFileSync('john.pdf', pdf);
  console.log('Done:', bookCode, bookCodes); // → 'JHN'  ['JHN']

  // Multiple books — pass an array, same options
  const multi = await usfmToPdf([sample, titusUsfm], { paperSize: 'A5' });
  writeFileSync('john-titus.pdf', multi.pdf);
  console.log('Books:', multi.bookCodes); // → ['JHN', 'TIT']
} catch (e) {
  if (e instanceof PtxprintNotFoundError) {
    console.error('Install PTXprint and add it to PATH');
  }
  throw e;
}
```

---

## API overview

### `usfmToPdf` — single or multiple books

One function handles both cases.  Pass a single input for one book, or an array to combine books into a single PDF.

```ts
import { usfmToPdf } from '@usfm-tools/ptxprint-driver';

// Single book
const { pdf, bookCode, bookCodes, log, tempDir } = await usfmToPdf(
  input,    // string | ScriptureInput
  options?, // RenderOptions
);
// bookCode  → 'JHN'
// bookCodes → ['JHN']

// Multiple books combined into one PDF
const { pdf, bookCodes } = await usfmToPdf(
  [johnInput, titusInput],  // Array<string | ScriptureInput>
  options?,
);
// bookCodes → ['JHN', 'TIT']
// PTXprint names the internal PDF: JHN-TIT_ptxp.pdf
```

`pdf` is a Node.js `Buffer` containing the raw PDF bytes.
`bookCode` is the **first** (or only) book's 3-letter code.
`bookCodes` is the **full ordered list** of book codes in the output PDF.

> **`usfmsToPdf` is deprecated** — it is now an alias for `usfmToPdf` and will be removed in a future major version.

---

### `diglotToPdf` — parallel columns

Renders the **same scripture book** in two languages side-by-side.

```ts
import { diglotToPdf } from '@usfm-tools/ptxprint-driver';

const { pdf } = await diglotToPdf(
  { format: 'usfm', text: spanishUsfm }, // left column
  { format: 'usfm', text: englishUsfm }, // right column
  options?,                               // RenderOptions
);
```

Both inputs must share the same `\id` book code, otherwise `BookIdMismatchError` is thrown.

---

## Input formats

Every function accepts a raw `string` (treated as USFM) or a typed `ScriptureInput`:

| Format | Shape |
|--------|-------|
| USFM | `{ format: 'usfm', text: string }` |
| USJ | `{ format: 'usj', usj: unknown }` — converted via `@usfm-tools/adapters` |
| USX | `{ format: 'usx', xml: string }` — converted via `usxXmlToUsfm` |

---

## `RenderOptions` reference

All options are optional.  Unset options fall back to PTXprint defaults.

### Page layout

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `paperSize` | `'A4' \| 'A5' \| 'USletter' \| { widthMm, heightMm }` | `'A4'` | Content page dimensions |
| `columns` | `1 \| 2` | `1` | Number of body text columns |
| `rtl` | `boolean` | `false` | Right-to-left layout |
| `marginsMm` | `number` | `12` | All-side page margins in mm (`paper/margins`) |
| `topMarginMm` | `number` | — | Override top margin in mm (`paper/topmargin`) |
| `bottomMarginMm` | `number` | — | Override bottom margin in mm (`paper/bottommargin`) |
| `mirrorMargins` | `boolean` | `false` | Mirror inner/outer margins and header/footer for double-sided printing (`header/mirrorlayout`). Also implied by `pageNumbers: 'header-outer'` and by `bindingGutterMm`. |
| `bindingGutterMm` | `number` | — | **Extra** mm added on the binding (inner/spine) side of each page, on top of `marginsMm`. Use for saddle-stitch or perfect-bind layouts where part of the inner margin is lost in the fold. Sets `paper/gutter` + `paper/ifaddgutter`; automatically enables `mirrorMargins` so the gutter alternates between recto and verso pages. **Effective inner margin = `marginsMm + bindingGutterMm`**. |

> **Margin arithmetic for saddle-stitch**
>
> | Setting | Value | Result |
> |---------|-------|--------|
> | `marginsMm` | 12 | outer margin = 12 mm |
> | `bindingGutterMm` | 6 | inner margin = 12 + 6 = **18 mm** |
> | `mirrorMargins` | *(auto)* | gutter alternates left/right on odd/even pages |
>
> ```ts
> // Saddle-stitch A5 booklet — wider inner/gutter margin
> {
>   paperSize: 'A5',
>   marginsMm: 12,          // outer margin
>   bindingGutterMm: 6,     // adds 6 mm on binding side → inner = 18 mm
>   pagesPerSpread: 2,      // 2-up imposition on A4 sheet
>   sheetSize: 'A4',
> }
> ```

---

### Typography

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `fontFamily` | `string` | bundled DejaVu Serif | Body font name (must be installed, or set via `PTXPRINT_BODY_FONT`) |
| `fontSizePt` | `number` | `12` | Body font size in points (`paper/fontfactor`) |
| `lineSpacingPt` | `number` | `15` | Baseline-to-baseline spacing in points (`paragraph/linespacing`) |
| `justify` | `boolean` | `true` | Justify body text (`paragraph/ifjustify`) |
| `hyphenate` | `boolean` | `false` | Enable hyphenation (`paragraph/ifhyphenate`) |

---

### Page numbers & header/footer

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pageNumbers` | `'none' \| 'footer-center' \| 'header-center' \| 'header-outer'` | `'footer-center'` | Page number position; `'header-outer'` implies `mirrorMargins` |
| `startPageNum` | `number` | `1` | Page number assigned to the first printed page |
| `headerRuleMm` | `number` | — | Width (mm) of rule below header; also enables `header/ifrhrule` |

---

### Content toggles

| Option | Type | Description |
|--------|------|-------------|
| `footnotes` | `boolean` | Include footnotes (`notes/includefootnotes`) |
| `crossRefs` | `boolean` | Include cross-references (`notes/includexrefs`) |
| `sectionHeads` | `boolean` | Show section headings (`document/sectionheads`) |
| `chapterNumbers` | `boolean` | Show chapter numbers (`document/ifshowchapternums`) |
| `verseNumbers` | `boolean` | Show verse numbers (`document/ifshowversenums`) |

---

### Booklet / imposition

These options control **printer's spreads** — placing multiple content pages on each physical sheet for folded booklet production (saddle-stitch / half-fold).

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `pagesPerSpread` | `1 \| 2` | `1` | Content pages per physical sheet. `2` = saddle-stitch 2-up. |
| `sheetSize` | `'A4' \| 'A5' \| 'USletter' \| { widthMm, heightMm }` | — | Physical sheet size for imposition. Set to the paper loaded in the printer (e.g. `'A4'` when `paperSize` is `'A5'`). Required when `pagesPerSpread = 2`. |
| `sheetsPerSignature` | `number` | `0` (single sig.) | Sheets per booklet section. `0` = all in one signature; `4` = 16 content pages per section. |
| `foldCutMarginMm` | `number` | — | Extra bleed margin (mm) at the fold/cut line. Typically `2`–`4` mm. |
| `foldFirst` | `boolean` | `false` | Fold before cut (affects page ordering within a signature). |

**Example — A5 saddle-stitch booklet printed on A4:**

```ts
const { pdf } = await usfmsToPdf([johnUsfm, titusUsfm], {
  paperSize: 'A5',
  columns: 1,
  pagesPerSpread: 2,
  sheetSize: 'A4',
  sheetsPerSignature: 0, // all in one signature
  foldCutMarginMm: 3,
});
```

The resulting PDF has A4 landscape pages (displayed via `Rotate=90`).  Each page shows two A5 content slots side-by-side in saddle-stitch order.  Print duplex, fold, and staple.

---

### Cover images (front & back)

The driver supports a full **cover spread** — an A4 landscape page prepended to the booklet PDF showing the front and back cover images side-by-side, matching the imposed content page size.

```
┌───────────────────────────────┐
│  Back cover  │  Front cover   │
│   (left)     │    (right)     │
└───────────────────────────────┘
   backCoverImagePath   coverImagePath
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `coverImagePath` | `string` | — | Path to a JPEG (`.jpg`/`.jpeg`) or PNG (`.png`) image for the **front cover** (right slot of the spread, first page the reader sees when the booklet is closed). |
| `backCoverImagePath` | `string` | — | Path to a JPEG or PNG for the **back cover** (left slot of the spread). When omitted the left slot is left white. Only meaningful when `pagesPerSpread >= 2`. |

**Behaviour:**

- When `pagesPerSpread = 2` the cover spread is an **A4 landscape** page (native — no PDF `Rotate`), whose displayed dimensions match the rest of the imposed booklet pages. The front cover fills the right half (A5 slot), the back cover fills the left half.
- When `pagesPerSpread = 1` (single-page mode) a plain full-page cover is prepended matching the content page size, using only `coverImagePath`.
- Images are **stretched to fill** their slot — supply pre-cropped artwork at the correct aspect ratio (A5 portrait ≈ `1:√2` ≈ `1:1.414`).
- Supported formats: JPEG (`.jpg`, `.jpeg`), PNG (`.png`).

**Example — saddle-stitch booklet with cover:**

```ts
import { usfmsToPdf } from '@usfm-tools/ptxprint-driver';
import { writeFileSync } from 'fs';

const { pdf } = await usfmsToPdf([johnUsfm, titusUsfm], {
  paperSize:         'A5',
  columns:            1,
  pagesPerSpread:     2,
  sheetSize:         'A4',
  foldCutMarginMm:    3,
  coverImagePath:    '/path/to/front-cover.jpg',  // right slot
  backCoverImagePath: '/path/to/back-cover.jpg',  // left slot (optional)
});
writeFileSync('bible-booklet.pdf', pdf);
```

The generated PDF structure:

```
Page 1  — Cover spread (A4 landscape)
            Left  = back cover image
            Right = front cover image
Pages 2+ — Saddle-stitch imposed content (A4 landscape via Rotate=90)
            Each page = two A5 content slots in booklet order
```

---

### Advanced cfg override

```ts
cfgOverrides?: PtxprintCfgSections
```

Arbitrary `ptxprint.cfg` sections merged **after** typed defaults.  Driver-managed keys (`project/id`, `book`, etc.) are re-applied last and cannot be overridden.

Use `'True'`/`'False'` (strings) for keys read by Python's `configparser.getboolean`.

```ts
await usfmToPdf(usfm, {
  cfgOverrides: {
    document: { sectionheads: 'True' },
    notes: { includefootnotes: 'True', includexrefs: 'True' },
    finishing: { pgsperspread: '1' },
  },
});
```

---

### PTXprint CLI pass-through

These options map 1-to-1 to PTXprint executable flags and are forwarded verbatim.

| Option | PTXprint flag | Description |
|--------|--------------|-------------|
| `fontPaths` | `-f` (repeatable) | Extra font search directories |
| `pdfVersion` | `-V` | PDF version number (`14` = 1.4, `17` = 1.7, `20` = 2.0) |
| `xetexTimeoutSec` | `--timeout` | XeTeX runtime timeout in seconds (distinct from `timeoutMs`) |
| `xetexRuns` | `-R` | Max XeTeX re-runs |
| `quiet` | `-q` | Suppress PTXprint splash / limit output |
| `noInternet` | `-N` | Disable internet access during run |
| `ptxDefine` | `-D` (repeatable) | UI component=value overrides e.g. `{ "Paper/pagesize": "A5" }` |
| `debugMode` | `--debug` | Enable PTXprint debug output |
| `logLevel` | `-l` | Logging level: `'DEBUG'` \| `'INFO'` \| `'WARN'` \| `'ERROR'` |
| `logFile` | `--logfile` | PTXprint log file path (or `'none'`) |
| `macrosDir` | `-m` | Directory containing ptx2pdf TeX macros (`paratext2.tex`) |
| `extras` | `-z` | Special flags string forwarded verbatim to PTXprint |

---

### Runtime / process control

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `langIso` | `string` | `'en'` | ISO 639 language code written to `Settings.xml` |
| `ptxprintPath` | `string` | — | Explicit path to the `ptxprint` executable |
| `timeoutMs` | `number` | `600 000` | Node spawn wall-clock timeout in ms |
| `keepTempDir` | `boolean` | `false` | Preserve the scaffold temp dir after a successful run (useful for debugging) |
| `onLog` | `(chunk: string) => void` | — | Streaming callback receiving PTXprint stdout/stderr |
| `signal` | `AbortSignal` | — | Cancel an in-progress render |

---

## Environment variables

| Variable | Meaning |
|----------|---------|
| `PTXPRINT_BIN` | Full path to the `ptxprint` executable (fallback when not on `PATH`) |
| `PTXPRINT_BODY_FONT` | Override body font family at process level (overrides `fontFamily`) |
| `PTXPRINT_INTEGRATION` | Set to `1` to run optional integration tests |

---

## Errors

| Class | Thrown when |
|-------|-------------|
| `PtxprintNotFoundError` | `ptxprint` not on `PATH` and `PTXPRINT_BIN` unset / invalid |
| `PtxprintExitError` | `ptxprint` exits with non-zero code, or the expected PDF was not produced |
| `BookIdMismatchError` | Diglot left/right texts have different `\id` book codes |
| `ScriptureNormalizeError` | Input cannot be converted to USFM |

---

## Low-level exports

For custom tooling that needs to control scaffolding or execution directly:

```ts
import {
  normalizeToUsfm,      // ScriptureInput → USFM string
  extractBookId,        // USFM string → 3-letter book code
  findPtxprint,         // locate ptxprint binary
  expectedPdfPath,      // compute PTXprint output path (handles _2up suffix)
  runPtxprint,          // low-level spawn wrapper
  scaffoldSingleBookProject, // build a Paratext project dir (single book)
  scaffoldProject,           // build a Paratext project dir (multiple books)
  mergeCfgOverrides,         // merge PtxprintCfgSections objects
  prependCoverPage,          // pdf-lib cover spread post-processor
  buildCoverPiclistLine,     // build a PTXprint .piclist line string
} from '@usfm-tools/ptxprint-driver';

// Useful types
import type {
  UsfmInput,       // string | ScriptureInput | Array<string | ScriptureInput>
  UsfmToPdfResult, // RenderResult & { bookCodes: string[] }
  RenderOptions,
  ScriptureInput,
} from '@usfm-tools/ptxprint-driver';
```

---

## Integration tests (optional)

Slow tests invoke the real PTXprint CLI.  They run when `PTXPRINT_INTEGRATION=1` or `PTXPRINT_BIN` points to an existing file.

```bash
cd packages/ptxprint-driver

# Enable via env var
PTXPRINT_INTEGRATION=1 bun run test:integration

# Or point to the binary directly (no flag needed)
PTXPRINT_BIN="C:/Program Files/PTXprint/ptxprint.exe" bun run test:integration
```

---

## Development

```bash
bun run build        # compile TypeScript → dist/
bun run test         # unit tests
bun run check-types  # tsc type-check only
```

---

## License

MIT
