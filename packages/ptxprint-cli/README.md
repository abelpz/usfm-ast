# @usfm-tools/ptxprint-cli

Zero-dependency Node.js CLI that converts USFM files to PDF via
[`@usfm-tools/ptxprint-driver`](../ptxprint-driver) (which wraps the PTXprint CLI).

Every `RenderOptions` field in the driver is exposed as a flag. The `--cfg-set`
and `--cfg-file` escapes give access to the full raw `ptxprint.cfg` surface.

## Prerequisites

- Node.js ≥ 18
- [PTXprint](https://software.sil.org/ptxprint/) installed and on `PATH`
  (or set `PTXPRINT_BIN` / pass `--ptxprint-path`)

## Install (monorepo)

```bash
# from usfm-ast root
bun install
```

## Usage

```bash
# Built-in fixture (no USFM file needed)
node packages/ptxprint-cli/bin/usfm2pdf.mjs --fixture tit

# Your own file
node packages/ptxprint-cli/bin/usfm2pdf.mjs my-book.usfm -o my-book.pdf

# Or if installed globally / via the monorepo bin link
usfm2pdf --fixture jhn --paper-size A5 --columns 2 -o john-a5.pdf
```

## All flags

Run `usfm2pdf --help` for the full flag reference. Quick summary:

| Category | Flag | ptxprint.cfg key |
|---|---|---|
| **Layout** | `--paper-size A5` | `paper/pagesize` + `paper/width` + `paper/height` |
| | `--columns 2` | `paper/columns` |
| | `--margins-mm 15` | `paper/margins` |
| | `--top-margin-mm 20` | `paper/topmargin` |
| | `--bottom-margin-mm 20` | `paper/bottommargin` |
| | `--rtl` | `document/ifrtl` |
| | `--mirror-margins` | `header/mirrorlayout` |
| **Typography** | `--font-family "Charis SIL"` | `document/fontregular` (+bold/italic variants) |
| | `--font-size-pt 11` | `paper/fontfactor` |
| | `--line-spacing-pt 14` | `paragraph/linespacing` |
| | `--no-justify` | `paragraph/ifjustify = False` |
| | `--hyphenate` | `paragraph/ifhyphenate = True` |
| **Page numbers** | `--page-numbers footer-center` | `footer/ftrcenter` |
| | `--page-numbers header-outer` | `header/hdrright` + `header/mirrorlayout` |
| | `--page-numbers none` | (all page-number slots set to `-empty-`) |
| | `--start-page-num 3` | `document/startpagenum` |
| | `--header-rule-mm 0.4` | `paper/rulegap` + `header/ifrhrule` |
| **Content** | `--footnotes` / `--no-footnotes` | `notes/includefootnotes` |
| | `--cross-refs` / `--no-cross-refs` | `notes/includexrefs` |
| | `--section-heads` / `--no-section-heads` | `document/sectionheads` |
| | `--chapter-numbers` / `--no-chapter-numbers` | `document/ifshowchapternums` |
| | `--verse-numbers` / `--no-verse-numbers` | `document/ifshowversenums` |
| **Raw cfg** | `--cfg-set notes/includefootnotes=True` | any key in any section |
| | `--cfg-file overrides.ini` | INI file merged after typed flags |

## Multi-book

Pass multiple files, or comma-separate fixture names:

```bash
usfm2pdf john.usfm genesis.usfm -o jhn-gen.pdf
usfm2pdf --fixture jhn,tit --paper-size A5 -o jhn-tit.pdf
```

## Debugging

```bash
# Keep the scaffold directory and stream the PTXprint log
usfm2pdf --fixture tit --keep-temp --verbose

# Inspect the generated ptxprint.cfg inside the printed scaffold path
```

## Built-in fixtures

| Name | Description |
|------|-------------|
| `tit` | Titus (3-chapter Pauline epistle, clean USFM) |
| `jhn` | John chapter 1 (prologue + calling of disciples) |

These are stored in `fixtures/` and are clean USFM without alignment markers,
ideal for testing rendering features without needing external scripture files.
