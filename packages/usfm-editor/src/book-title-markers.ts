/**
 * USFM pre-chapter regions: book titles (`\mt#`, `\mte#`), book introduction (`\ip`, `\is#`, …),
 * vs book identification (`\id`, `\h`, `\toc#`, …). See USFM document structure.
 */

/** Main book titles only (`\mt#`, `\mte#`) — not `\imt#` (introduction). */
export function isBookTitleParaMarker(marker: string): boolean {
  const m = marker.toLowerCase();
  if (m.startsWith('mte') && !m.startsWith('imte')) return true;
  if (m.startsWith('mt') && !m.startsWith('imt')) return true;
  return false;
}

/**
 * Book introduction paragraphs before `\c` (`\imt#`, `\ip`, `\is#`, `\io#`, `\cl`, …).
 */
export function isIntroductionParaMarker(marker: string): boolean {
  const m = marker.toLowerCase();
  if (m.startsWith('imt') || m.startsWith('imte')) return true;
  if (m === 'ip' || m.startsWith('ipi')) return true;
  if (m === 'im' || m.startsWith('imi')) return true;
  if (m.startsWith('ipq') || m.startsWith('imq') || m.startsWith('ipr') || m.startsWith('ipc')) return true;
  if (m.startsWith('iq')) return true;
  if (m.startsWith('ili')) return true;
  if (m === 'ib' || m === 'iot' || m.startsWith('io') || m.startsWith('iex') || m === 'ie') return true;
  if (m.startsWith('is')) return true; // \is# intro section headings
  if (m === 'cl') return true;
  if (m === 'lit') return true;
  return false;
}

/** Identification / headers: everything else before `\c` (incl. `\id`, `\h`, `\toc#`, …). */
export function isIdentificationParaMarker(marker: string): boolean {
  return !isBookTitleParaMarker(marker) && !isIntroductionParaMarker(marker);
}
