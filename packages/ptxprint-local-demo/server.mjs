import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';
import {
  PtxprintExitError,
  PtxprintNotFoundError,
  usfmToPdf,
  usfmsToPdf,
} from '@usfm-tools/ptxprint-driver';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(express.static(path.join(__dirname, 'public')));

/** Minimal INI parser for `rawCfg` overrides (section headers + key = value). */
function parseIni(text) {
  const result = {};
  let sec = null;
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith(';') || t.startsWith('#')) continue;
    const sm = t.match(/^\[([^\]]+)\]$/);
    if (sm) {
      sec = sm[1].trim().toLowerCase();
      result[sec] ??= {};
      continue;
    }
    const kv = t.match(/^([^=]+)=(.*)$/);
    if (kv && sec) result[sec][kv[1].trim()] = kv[2].trim();
  }
  return result;
}

/** Merge cfg section maps; section keys normalized to lowercase. */
function mergeCfgSections(a, b) {
  const out = {};
  for (const [section, keys] of Object.entries(a || {})) {
    const k = section.trim().toLowerCase();
    out[k] = { ...(out[k] || {}), ...(keys || {}) };
  }
  for (const [section, keys] of Object.entries(b || {})) {
    const k = section.trim().toLowerCase();
    out[k] = { ...(out[k] || {}), ...(keys || {}) };
  }
  return out;
}

app.post('/api/pdf', async (req, res) => {
  // Support either a single `usfm` string or an array `usfms: string[]` for multi-book.
  const rawUsfm = req.body?.usfm;
  const rawUsfms = req.body?.usfms;

  const inputs = Array.isArray(rawUsfms)
    ? rawUsfms
    : typeof rawUsfm === 'string' && rawUsfm.trim()
      ? [rawUsfm]
      : null;

  if (!inputs || inputs.length === 0) {
    return res
      .status(400)
      .json({ error: 'JSON body must include "usfm" (string) or "usfms" (string[]).' });
  }

  const allowedPaperSizes = ['A4', 'A5', 'USletter'];

  /** @type {import('@usfm-tools/ptxprint-driver').RenderOptions} */
  const opts = {
    timeoutMs: 900_000,
    paperSize: allowedPaperSizes.includes(req.body?.paperSize) ? req.body.paperSize : 'A5',
  };
  if (req.body?.columns === 2) opts.columns = 2;
  if (req.body?.rtl === true) opts.rtl = true;
  if (req.body?.mirrorMargins === true) opts.mirrorMargins = true;

  const marginsMm = Number(req.body?.marginsMm);
  if (Number.isFinite(marginsMm) && marginsMm >= 0) opts.marginsMm = marginsMm;

  const startPageNum = Number(req.body?.startPageNum);
  if (Number.isInteger(startPageNum) && startPageNum >= 0) opts.startPageNum = startPageNum;

  const allowedPageNumbers = ['none', 'footer-center', 'header-center', 'header-outer'];
  if (allowedPageNumbers.includes(req.body?.pageNumbers)) opts.pageNumbers = req.body.pageNumbers;

  if (typeof req.body?.langIso === 'string' && req.body.langIso.trim()) {
    opts.langIso = req.body.langIso.trim();
  }
  if (typeof req.body?.ptxprintPath === 'string' && req.body.ptxprintPath.trim()) {
    opts.ptxprintPath = req.body.ptxprintPath.trim();
  }
  if (typeof req.body?.fontFamily === 'string' && req.body.fontFamily.trim()) {
    opts.fontFamily = req.body.fontFamily.trim();
  }
  const fontSizePt = Number(req.body?.fontSizePt);
  if (Number.isFinite(fontSizePt) && fontSizePt > 0) opts.fontSizePt = fontSizePt;

  const lineSpacingPt = Number(req.body?.lineSpacingPt);
  if (Number.isFinite(lineSpacingPt) && lineSpacingPt > 0) opts.lineSpacingPt = lineSpacingPt;

  let cfgOv = {};
  if (typeof req.body?.rawCfg === 'string' && req.body.rawCfg.trim()) {
    cfgOv = mergeCfgSections(cfgOv, parseIni(req.body.rawCfg));
  }
  if (
    req.body?.cfgOverrides &&
    typeof req.body.cfgOverrides === 'object' &&
    !Array.isArray(req.body.cfgOverrides)
  ) {
    cfgOv = mergeCfgSections(cfgOv, req.body.cfgOverrides);
  }
  if (Object.keys(cfgOv).length) opts.cfgOverrides = cfgOv;

  try {
    const result =
      inputs.length === 1
        ? await usfmToPdf(inputs[0], { ...opts, onLog: (chunk) => process.stderr.write(chunk) })
        : await usfmsToPdf(inputs, { ...opts, onLog: (chunk) => process.stderr.write(chunk) });

    const bookLabel = 'bookCodes' in result
      ? result.bookCodes.join('+')
      : result.bookCode;

    // Sanitize custom filename: strip path separators and non-printable chars, append .pdf
    const rawName = typeof req.body?.filename === 'string' ? req.body.filename.trim() : '';
    const safeName = rawName
      ? rawName.replace(/[/\\:*?"<>|]/g, '_').replace(/\.pdf$/i, '') + '.pdf'
      : 'usfm.pdf';

    res.setHeader('X-Book-Code', bookLabel);
    res.setHeader('X-Log-Chars', String(result.log.length));
    res.setHeader('X-Filename', safeName);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
    res.send(result.pdf);
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    const status = err instanceof PtxprintNotFoundError ? 503 : 500;
    const payload = {
      error: err.message,
      name: err.name,
    };
    if (err instanceof PtxprintExitError) {
      payload.code = err.code;
      payload.log = err.log;
      payload.tempDir = err.tempDir;
    }
    res.status(status).json(payload);
  }
});

const server = http.createServer(app);
const envPort = process.env.PORT;
const startPort = envPort !== undefined ? Number(envPort) : 3876;
const maxPort = envPort !== undefined ? startPort : startPort + 30;
let port = startPort;

function listenNext() {
  server.listen(port, '127.0.0.1', () => {
    console.error(`PTXprint local demo → http://127.0.0.1:${port}`);
    console.error('Needs PTXprint: `ptxprint` on PATH or env PTXPRINT_BIN.');
  });
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE' && port < maxPort) {
    console.error(`Puerto ${port} ocupado; probando ${port + 1}…`);
    port += 1;
    listenNext();
    return;
  }
  throw err;
});

listenNext();
