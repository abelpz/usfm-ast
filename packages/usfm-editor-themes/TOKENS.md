# USFM editor chrome CSS variables

These custom properties are read by `@usfm-tools/editor-themes/base.css` (and by app-level CSS). Defaults live on `.ProseMirror`; built-in themes override them under `.ProseMirror[data-usfm-theme='…']`.

The canonical list (used in tests) is **`USFM_CHROME_CSS_VARIABLES`** in `src/tokens.ts`.

| Token | Role |
| --- | --- |
| `--usfm-bg`, `--usfm-fg`, `--usfm-fg-muted` | Page / text |
| `--usfm-border`, `--usfm-border-subtle`, `--usfm-accent` | Structure and focus |
| `--usfm-surface`, `--usfm-surface-hi` | Raised panels |
| `--usfm-radius-sm`, `--usfm-radius-md`, `--usfm-radius-lg` | Corners |
| `--usfm-font`, `--usfm-font-mono`, `--usfm-size-body`, `--usfm-line-height` | Typography |
| `--usfm-chapter-*` | Chapter block, bar, number, chips |
| `--usfm-header-*` | Identification (`\id`) card |
| `--usfm-marker-*` | Marker chips in header rows |
| `--usfm-verse-*` | Verse number pills |
| `--usfm-bt-*` | Book titles region |
| `--usfm-heading-fg`, `--usfm-italic-fg`, `--usfm-para-gap` | Body scripture |
| `--usfm-input-*` | Book code field |
| `--usfm-dd-*` | Book code dropdown (also mirrored on `body[data-usfm-theme]` for portaled menus) |
| `--usfm-ts-*` | Optional translator milestone accents (defaults inlined in CSS) |

Use any string for `data-usfm-theme` if you supply matching selectors in your own stylesheet.
