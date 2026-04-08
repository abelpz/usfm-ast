/**
 * Serialize Lucide {@link IconNode} arrays to inline SVG (no `document`, tree-shake friendly).
 */
export type IconNode = [string, Record<string, string | number | undefined>][];

function escAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

/** Lucide default icon geometry; stroke/fill follow currentColor. */
export function lucideIconToSvg(icon: IconNode, size = 16): string {
  const inner = icon
    .map(([tag, attrs]) => {
      const parts = Object.entries(attrs)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => `${escAttr(k)}="${escAttr(String(v))}"`)
        .join(' ');
      return `<${tag} ${parts} />`;
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}

/** Bold single letter (verse **V**, chapter **C**) for actions that have no standard Doc icon. */
export function boldLetterSvg(letter: string, size = 16): string {
  const fs = Math.round(size * 0.78);
  const esc = escAttr(letter).slice(0, 1) || '?';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="17" text-anchor="middle" font-size="${fs}" font-weight="700" font-family="system-ui,Segoe UI,Roboto,sans-serif" fill="currentColor" stroke="none">${esc}</text></svg>`;
}
