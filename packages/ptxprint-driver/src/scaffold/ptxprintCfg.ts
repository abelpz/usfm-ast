import type { PtxprintCfgSections, RenderOptions } from '../types';

import { paperSizeStrings } from './settingsXml';

export interface PtxprintCfgParams {
  projectId: string;
  /** First (or only) book code. Use `bookCodes` for multi-book runs. */
  bookCode?: string;
  /** All book codes to include when printing multiple books. */
  bookCodes?: string[];
  render: RenderOptions;
  diglot?: {
    secondaryProjectId: string;
    secondaryConfigId?: string;
  };
}

function normalizeSectionName(sec: string): string {
  return sec.trim().toLowerCase();
}

function getOrCreateSection(
  m: Map<string, Map<string, string>>,
  section: string,
): Map<string, string> {
  const key = normalizeSectionName(section);
  if (!m.has(key)) m.set(key, new Map());
  return m.get(key)!;
}

/** Merge user overrides; section keys normalized to lowercase. */
export function mergeCfgOverrides(
  target: Map<string, Map<string, string>>,
  overrides: PtxprintCfgSections | undefined,
): void {
  if (!overrides) return;
  for (const [sec, keys] of Object.entries(overrides)) {
    if (!keys) continue;
    const map = getOrCreateSection(target, sec);
    for (const [k, v] of Object.entries(keys)) {
      map.set(k.trim(), v);
    }
  }
}

function serializeSectionMap(m: Map<string, Map<string, string>>): string {
  const lines: string[] = [];
  for (const [sec, keys] of m) {
    lines.push(`[${sec}]`);
    for (const [k, v] of keys) {
      lines.push(`${k} = ${v}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd() + '\n';
}

const KNOWN_SECTION_ORDER = [
  'project',
  'document',
  'paper',
  'paragraph',
  'header',
  'footer',
  'notes',
  'finishing',
];

function reorderSections(m: Map<string, Map<string, string>>): Map<string, Map<string, string>> {
  const out = new Map<string, Map<string, string>>();
  for (const sec of KNOWN_SECTION_ORDER) {
    if (m.has(sec)) out.set(sec, m.get(sec)!);
  }
  for (const [sec, keys] of m) {
    if (!out.has(sec)) out.set(sec, keys);
  }
  return out;
}

function boolStr(v: boolean): string {
  return v ? 'True' : 'False';
}

function applyProtectedProjectKeys(
  m: Map<string, Map<string, string>>,
  opts: {
    projectId: string;
    primaryBook: string;
    allCodes: string[];
    multiBook: boolean;
  },
): void {
  const proj = getOrCreateSection(m, 'project');
  proj.set('id', opts.projectId);
  proj.set('book', opts.primaryBook);
  proj.set('bookscope', opts.multiBook ? 'multiple' : 'single');
  if (opts.multiBook) {
    proj.set('booklist', opts.allCodes.join(' '));
  } else {
    proj.delete('booklist');
  }

  const doc = getOrCreateSection(m, 'document');
  /** Without ifmainbodytext=True PTXprint strips every \c … marker (regex.S). */
  doc.set('ifmainbodytext', 'True');
}

/**
 * Phase 1: typed defaults (fonts, layout, header/footer, finishing).
 */
function applyTypedDefaults(
  m: Map<string, Map<string, string>>,
  p: PtxprintCfgParams,
): void {
  const { render, diglot } = p;

  const allCodes = p.bookCodes ?? (p.bookCode ? [p.bookCode] : []);
  const primaryBook = allCodes[0] ?? '';
  const multiBook = allCodes.length > 1;

  /**
   * Default matches bundled `vendor/fonts/DejaVuSerif.ttf` copied to `shared/fonts/`.
   * Bold/italic/bolditalic use embolden/slant features so one Regular face suffices (ptx2pdf cookbook).
   */
  const family = render.fontFamily ?? 'DejaVu Serif';

  const rtl = render.rtl === true ? 'rtl' : 'ltr';
  const { label: pagesize, height, width } = paperSizeStrings(render.paperSize);

  const columns = render.columns === 2;

  let marginsMm = 12;
  if (typeof render.marginsMm === 'number') {
    marginsMm = Math.round(render.marginsMm);
  } else if (typeof render.marginUnitInches === 'number') {
    marginsMm = Math.round(render.marginUnitInches * 25.4);
  }

  const fontSizePt = render.fontSizePt ?? 12;
  const lineSpacingPt = render.lineSpacingPt ?? 15;

  const pageNumbers = render.pageNumbers ?? 'footer-center';
  const startPageNum = render.startPageNum ?? 1;
  // bindingGutterMm implies mirrorLayout so the gutter alternates sides correctly
  const mirrorLayout =
    render.mirrorMargins === true ||
    pageNumbers === 'header-outer' ||
    render.bindingGutterMm != null;

  const topMm = render.topMarginMm ?? 15;
  const bottomMm = render.bottomMarginMm ?? 15;
  const ruleGap =
    typeof render.headerRuleMm === 'number' ? String(render.headerRuleMm) : '0';
  const headerRuleOn =
    typeof render.headerRuleMm === 'number' ? boolStr(true) : boolStr(false);

  const justify =
    render.justify !== undefined ? boolStr(render.justify) : boolStr(true);
  const hyphenate =
    render.hyphenate !== undefined ? boolStr(render.hyphenate) : boolStr(false);

  // ── [document]
  {
    const doc = getOrCreateSection(m, 'document');
    doc.set('fontregular', `${family}||false|false|`);
    doc.set('fontbold', `${family}||false|false|embolden=2`);
    doc.set('fontitalic', `${family}||false|false|slant=0.15`);
    doc.set('fontbolditalic', `${family}||false|false|embolden=2|slant=0.15`);
    doc.set('fontextraregular', '||false|false|');
    doc.set('ifrtl', rtl);
    doc.set('ifmainbodytext', 'True');
    doc.set('ifdiglot', diglot ? 'True' : 'False');
    if (diglot) {
      doc.set('diglotsecprj', diglot.secondaryProjectId);
      doc.set('diglotsecconfig', diglot.secondaryConfigId ?? 'Default');
      doc.set('diglotprifraction', '50');
      doc.set('diglotsecfraction', '50');
      doc.set('diglotsepnotes', 'True');
      doc.set('diglotpicsources', 'pri');
      doc.set('diglotmergemode', 'doc');
    }
    doc.set('multibook', multiBook ? 'True' : 'False');
    doc.set('startpagenum', String(startPageNum));

    if (render.sectionHeads !== undefined) doc.set('sectionheads', boolStr(render.sectionHeads));
    if (render.chapterNumbers !== undefined)
      doc.set('ifshowchapternums', boolStr(render.chapterNumbers));
    if (render.verseNumbers !== undefined)
      doc.set('ifshowversenums', boolStr(render.verseNumbers));

  }

  // ── [paper]
  {
    const paper = getOrCreateSection(m, 'paper');
    paper.set('pagesize', pagesize);
    paper.set('height', height);
    paper.set('width', width);
    paper.set('columns', columns ? 'True' : 'False');
    paper.set('margins', String(marginsMm));
    paper.set('fontfactor', String(fontSizePt));
    paper.set('topmargin', String(topMm));
    paper.set('bottommargin', String(bottomMm));
    paper.set('headerpos', '8');
    paper.set('footerpos', '8');
    paper.set('rulegap', ruleGap);

    // Binding gutter: extra mm on the inner/spine side of each page.
    // ifaddgutter enables it; gutter sets the extra mm.
    // mirrorLayout (set above) ensures it alternates sides on odd/even pages.
    if (render.bindingGutterMm != null) {
      paper.set('ifaddgutter', 'true');
      paper.set('gutter', String(render.bindingGutterMm));
    }
  }

  // ── [paragraph]
  {
    const para = getOrCreateSection(m, 'paragraph');
    para.set('linespacing', String(lineSpacingPt));
    para.set('ifjustify', justify);
    para.set('ifhyphenate', hyphenate);
  }

  // ── [header]
  const hdrCenter = pageNumbers === 'header-center' ? 'Page Number' : '-empty-';
  const hdrRight = pageNumbers === 'header-outer' ? 'Page Number' : '-empty-';
  {
    const header = getOrCreateSection(m, 'header');
    header.set('hdrleft', '-empty-');
    header.set('hdrleftside', 'Pri');
    header.set('hdrcenter', hdrCenter);
    header.set('hdrcenterside', 'Pri');
    header.set('hdrright', hdrRight);
    header.set('hdrrightside', 'Pri');
    header.set('mirrorlayout', mirrorLayout ? 'true' : 'false');
    header.set('ifshowbook', 'false');
    header.set('ifshowchapter', 'false');
    header.set('ifshowverse', 'false');
    header.set('ifrhrule', headerRuleOn);
  }

  // ── [footer]
  const ftrCenter = pageNumbers === 'footer-center' ? 'Page Number' : '-empty-';
  {
    const footer = getOrCreateSection(m, 'footer');
    footer.set('ftrcenter', ftrCenter);
    footer.set('ftrcenterside', 'Pri');
    footer.set('ifftrtitlepagenum', 'False');
    footer.set('ifprintconfigname', 'False');
  }

  // ── [notes]
  if (render.footnotes !== undefined || render.crossRefs !== undefined) {
    const notes = getOrCreateSection(m, 'notes');
    if (render.footnotes !== undefined) notes.set('includefootnotes', boolStr(render.footnotes));
    if (render.crossRefs !== undefined) notes.set('includexrefs', boolStr(render.crossRefs));
  }

  /** runjob.procpdf passes finishing/* into pdf/procpdf.py; missing pgsperspread becomes None and crashes int(). */
  {
    const finishing = getOrCreateSection(m, 'finishing');

    const pgsPerSpread = render.pagesPerSpread ?? 1;
    finishing.set('pgsperspread', String(pgsPerSpread));

    // sheetSize is the physical sheet fed to the printer (relevant when pgsPerSpread > 1).
    // If not specified, use the content page size as the sheet size.
    let sheetSizeStr: string;
    if (render.sheetSize != null) {
      sheetSizeStr = paperSizeStrings(render.sheetSize).label;
    } else if (pgsPerSpread > 1) {
      // Default to A4 when spreads are requested and page is A5 (most common case).
      sheetSizeStr = paperSizeStrings('A4').label;
    } else {
      sheetSizeStr = pagesize;
    }
    finishing.set('sheetsize', sheetSizeStr);

    finishing.set('sheetsinsigntr', String(render.sheetsPerSignature ?? 0));
    finishing.set('foldcutmargin', String(render.foldCutMarginMm ?? 0));
    finishing.set('foldfirst', boolStr(render.foldFirst ?? false));
    finishing.set('inclsettings', 'False');
    finishing.set('spotcolor', 'rgb(0, 0, 0)');
    finishing.set('spottolerance', '15');
  }
}

/** Minimal INI subset PTXprint expects; defaults mirror common desktop installs. */
export function buildPtxprintCfg(p: PtxprintCfgParams): string {
  const m = new Map<string, Map<string, string>>();
  applyTypedDefaults(m, p);
  mergeCfgOverrides(m, p.render.cfgOverrides);
  const allCodes = p.bookCodes ?? (p.bookCode ? [p.bookCode] : []);
  applyProtectedProjectKeys(m, {
    projectId: p.projectId,
    primaryBook: allCodes[0] ?? '',
    allCodes,
    multiBook: allCodes.length > 1,
  });
  return serializeSectionMap(reorderSections(m));
}
