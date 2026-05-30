import { basename } from 'path';

/**
 * Inject a full-page cover `\fig` marker directly into USFM text so that
 * XeTeX renders it as the **very first content page** — before the book title.
 *
 * ## Why inline injection rather than the piclist mechanism
 *
 * PTXprint's piclist trigger system is float-based: even when a figure is
 * declared at the start of a paragraph, TeX defers large floats (`pgpos="p"`)
 * until the next available page.  This means a piclist figure at the `\mt1`
 * trigger ends up on content page 2 (after the title), not page 1.
 *
 * Injecting `\fig` directly **before** `\mt1` in the USFM source causes XeTeX
 * to encounter the figure before any text is output.  Because the figure is
 * the first content TeX sees, `pgpos="p"` places it immediately on its own
 * page (page 1), with the title following on page 2.
 *
 * ## Placement rules
 *
 * - The marker is inserted immediately before the FIRST `\mt1`/`\mt2`/`\mt3`
 *   line (main title), or before `\c 1` when there is no `\mt*`.
 * - `size="page"` fills the full paper area (full-bleed, no margin gutters).
 * - `pgpos="p"` occupies an entire content page.
 * - `media="p"` = print output only.
 *
 * @param usfmText      Raw USFM book text.
 * @param imageFilePath Absolute or relative path to the cover image.
 *                      Only the basename is embedded; the caller must copy
 *                      the file to `<projectDir>/figures/<basename>`.
 * @returns USFM text with the `\fig` marker injected.
 */
export function injectCoverFigureIntoUsfm(usfmText: string, imageFilePath: string): string {
  const filename = basename(imageFilePath);
  // USFM 3 attribute syntax — pgpos="p" forces a full dedicated page.
  const figLine = `\\fig Book Cover|src="${filename}" size="page" pgpos="p" media="p"\\fig*\n`;

  // Prefer to place just before the main title block (\mt*), falling back to \c 1.
  const insertMatch =
    /^\\mt\d?\s/m.exec(usfmText) ??
    /^\\c\s+1\b/m.exec(usfmText);

  if (!insertMatch) return usfmText;

  const pos = insertMatch.index;
  return usfmText.slice(0, pos) + figLine + usfmText.slice(pos);
}

/**
 * Build a PTXprint `.piclist` entry (kept for reference / fallback use).
 * @deprecated  Inline injection via {@link injectCoverFigureIntoUsfm} is preferred.
 */
export function buildCoverPiclistLine(bookCode: string, imageFilePath: string): string {
  const filename = basename(imageFilePath);
  return `${bookCode} 0.1=1 Book Cover|src="${filename}" size="page" pgpos="p" media="p"\n`;
}
