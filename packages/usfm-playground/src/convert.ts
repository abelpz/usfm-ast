import {
  USFMParser,
  USFMVisitor,
  USXVisitor,
  convertUSJDocumentToUSFM,
} from './parser-adapters';
import { formatUsxXml } from './format-xml';

export type InputMode = 'usfm' | 'usj' | 'usx';

export type OutputLanguage = 'json' | 'xml' | 'usfm';

export interface Timings {
  parseMs: number;
  toJsonMs: number;
  usfmVisitorMs: number;
  usxVisitorMs: number;
}

export interface ConversionResult {
  ok: boolean;
  error?: string;
  note?: string;
  outA: { label: string; text: string; language: OutputLanguage };
  outB: { label: string; text: string; language: OutputLanguage };
  timings: Timings;
  logs: Array<{ type: 'warn' | 'error'; message: string }>;
  inferredMarkerNames: string[];
  /** Markers seen in source USFM (`\name` / `\+name`) whose normalized name never appears on a USJ `marker` field. */
  markersInSourceNotInAst: string[];
}

function extractSourceMarkers(usfm: string): Set<string> {
  const out = new Set<string>();
  const re = /\\(\+)?([a-z][a-z0-9]*\*?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(usfm)) !== null) {
    const name = m[1] ? `+${m[2]}` : m[2];
    out.add(name);
  }
  return out;
}

function normMarker(m: string): string {
  return m.replace(/^\+/, '').toLowerCase();
}

function collectMarkersFromUsj(node: unknown, out: Set<string>): void {
  if (node === null || node === undefined) return;
  if (typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const x of node) collectMarkersFromUsj(x, out);
    return;
  }
  const o = node as Record<string, unknown>;
  if (typeof o.marker === 'string') out.add(o.marker);
  for (const v of Object.values(o)) collectMarkersFromUsj(v, out);
}

function markersMissingFromAst(sourceUsfm: string, usj: unknown): string[] {
  const fromSource = extractSourceMarkers(sourceUsfm);
  const fromAst = new Set<string>();
  collectMarkersFromUsj(usj, fromAst);
  const astNorm = new Set([...fromAst].map(normMarker));
  const missing: string[] = [];
  for (const s of fromSource) {
    if (!astNorm.has(normMarker(s))) missing.push(s);
  }
  return missing.sort();
}

function parseUsfmPipeline(usfm: string): {
  usj: unknown;
  usfmOut: string;
  usxOut: string;
  timings: Timings;
  logs: Array<{ type: 'warn' | 'error'; message: string }>;
  inferredMarkerNames: string[];
  missingMarkers: string[];
} {
  const timings: Timings = {
    parseMs: 0,
    toJsonMs: 0,
    usfmVisitorMs: 0,
    usxVisitorMs: 0,
  };

  const tParse0 = performance.now();
  const parser = new USFMParser({ silentConsole: true });
  parser.load(usfm).parse();
  timings.parseMs = performance.now() - tParse0;

  const tJson0 = performance.now();
  const usj = parser.toJSON();
  timings.toJsonMs = performance.now() - tJson0;

  const tUsfm0 = performance.now();
  const usfmVisitor = new USFMVisitor();
  parser.visit(usfmVisitor);
  const usfmOut = usfmVisitor.getResult();
  timings.usfmVisitorMs = performance.now() - tUsfm0;

  const tUsx0 = performance.now();
  const usxVisitor = new USXVisitor({});
  parser.visit(usxVisitor);
  const usxOut = usxVisitor.getDocument();
  timings.usxVisitorMs = performance.now() - tUsx0;

  const logs = parser.getLogs();
  const inferred = parser.getInferredMarkers();
  const inferredMarkerNames = Object.keys(inferred).sort();
  const missingMarkers = markersMissingFromAst(usfm, usj);

  return {
    usj,
    usfmOut,
    usxOut,
    timings,
    logs,
    inferredMarkerNames,
    missingMarkers,
  };
}

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

function validateXml(usx: string): { ok: boolean; error?: string } {
  try {
    const p = new DOMParser();
    const doc = p.parseFromString(usx, 'application/xml');
    const err = doc.querySelector('parsererror');
    if (err) {
      return { ok: false, error: err.textContent || 'Invalid XML' };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function convert(input: string, mode: InputMode): ConversionResult {
  const emptyTimings: Timings = {
    parseMs: 0,
    toJsonMs: 0,
    usfmVisitorMs: 0,
    usxVisitorMs: 0,
  };

  if (mode === 'usx') {
    const xmlCheck = validateXml(input.trim());
    return {
      ok: xmlCheck.ok,
      error: xmlCheck.ok ? undefined : xmlCheck.error,
      note:
        'The @usfm-tools stack does not ship a USX → USFM/USJ importer in this repo. Use **USFM** or **USJ** input to run the parser and visitors. This panel only validates XML and pretty-prints.',
      outA: {
        label: 'USFM (not generated)',
        text:
          xmlCheck.ok === false
            ? `Fix XML or switch to USFM/USJ input.\n\n${xmlCheck.error ?? ''}`
            : '— Switch to USFM or USJ mode to generate USFM from the AST. —\n',
        language: 'usfm',
      },
      outB: {
        label: 'USJ (not generated)',
        text:
          '— Switch to USFM or USJ mode to produce USJ via the parser. —\n',
        language: 'json',
      },
      timings: emptyTimings,
      logs: [],
      inferredMarkerNames: [],
      markersInSourceNotInAst: [],
    };
  }

  if (mode === 'usj') {
    let doc: unknown;
    try {
      doc = JSON.parse(input);
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : 'Invalid JSON',
        outA: { label: 'USFM', text: '', language: 'usfm' },
        outB: { label: 'USX', text: '', language: 'xml' },
        timings: emptyTimings,
        logs: [],
        inferredMarkerNames: [],
        markersInSourceNotInAst: [],
      };
    }

    try {
      const t0 = performance.now();
      const usfm = convertUSJDocumentToUSFM(doc as { content?: unknown[] });
      const genMs = performance.now() - t0;

      const pipeline = parseUsfmPipeline(usfm);
      return {
        ok: true,
        note: `USJ → USFM serialization took ${genMs.toFixed(2)} ms (before parse). Diagnostics below refer to a fresh parse of that USFM.`,
        outA: {
          label: 'USFM (from USJ)',
          text: usfm.endsWith('\n') ? usfm : usfm + '\n',
          language: 'usfm',
        },
        outB: {
          label: 'USX (from parsed USFM)',
          text: formatUsxXml(pipeline.usxOut),
          language: 'xml',
        },
        timings: { ...pipeline.timings, parseMs: pipeline.timings.parseMs },
        logs: pipeline.logs,
        inferredMarkerNames: pipeline.inferredMarkerNames,
        markersInSourceNotInAst: pipeline.missingMarkers,
      };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        outA: { label: 'USFM', text: '', language: 'usfm' },
        outB: { label: 'USX', text: '', language: 'xml' },
        timings: emptyTimings,
        logs: [],
        inferredMarkerNames: [],
        markersInSourceNotInAst: [],
      };
    }
  }

  // USFM
  try {
    const pipeline = parseUsfmPipeline(input);
    return {
      ok: true,
      outA: {
        label: 'USJ',
        text: prettyJson(pipeline.usj),
        language: 'json',
      },
      outB: {
        label: 'USX',
        text: formatUsxXml(pipeline.usxOut),
        language: 'xml',
      },
      timings: pipeline.timings,
      logs: pipeline.logs,
      inferredMarkerNames: pipeline.inferredMarkerNames,
      markersInSourceNotInAst: pipeline.missingMarkers,
    };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      outA: { label: 'USJ', text: '', language: 'json' },
      outB: { label: 'USX', text: '', language: 'xml' },
      timings: emptyTimings,
      logs: [],
      inferredMarkerNames: [],
      markersInSourceNotInAst: [],
    };
  }
}
