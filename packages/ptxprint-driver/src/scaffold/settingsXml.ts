import type { RenderOptions } from '../types';

export function buildSettingsXml(opts: {
  langIso: string;
  fileNamePostPart: string;
}): string {
  const { langIso, fileNamePostPart } = opts;
  return `<?xml version="1.0" encoding="utf-8"?>
<ScriptureText>
  <StyleSheet>usfm.sty</StyleSheet>
  <Versification>4</Versification>
  <LanguageIsoCode>${escapeXml(langIso)}</LanguageIsoCode>
  <FileNameBookNameForm>41MAT</FileNameBookNameForm>
  <FileNamePrePart />
  <FileNamePostPart>${escapeXml(fileNamePostPart)}</FileNamePostPart>
</ScriptureText>
`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function paperSizeStrings(
  paperSize: RenderOptions['paperSize'] | undefined,
): { label: string; height: string; width: string } {
  if (paperSize == null || paperSize === 'A5') {
    const s = '148mm, 210mm (A5)';
    return { label: s, height: s, width: s };
  }
  if (paperSize === 'A4') {
    const s = '210mm, 297mm (A4)';
    return { label: s, height: s, width: s };
  }
  if (paperSize === 'USletter') {
    const s = '215.9mm, 279.4mm (Letter)';
    return { label: s, height: s, width: s };
  }
  const { widthMm, heightMm } = paperSize;
  const s = `${widthMm}mm, ${heightMm}mm (Custom)`;
  return { label: s, height: s, width: s };
}
