/**
 * Requires devDependency `usfm3` (root `bun install`).
 * Note: usfm3@0.1.x often returns {} from toUsj() — we still write JSON with an _oracleNote
 * so the file is not mistaken for a failed run. USX and vref stay authoritative for usfm3.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { parse } from 'usfm3';

const [, , infile, outUsx, outVref, outUsj] = process.argv;
if (!infile || !outUsx || !outVref || !outUsj) {
  console.error('usage: node dump-usfm3.mjs <input.usfm> <out.usx> <out.vref.json> <out.usj.json>');
  process.exit(2);
}

/** Readable USX without a full XML formatter: one tag per line where `><` appears. */
function roughPrettyXml(xml) {
  return xml.replace(/></g, '>\n<');
}

function usjPayload(raw) {
  if (raw && typeof raw === 'object' && Object.keys(raw).length > 0) {
    return raw;
  }
  return {
    _oracleNote:
      'usfm3 toUsj() returned no keys in usfm3@0.1.x for this input. Use usfm3.usx / usfm3.vref.json here, or compare usfm-parser.usj.json and (with Python) usfmtc.usj.json for full USJ.',
  };
}

const usfm = readFileSync(infile, 'utf8');
const r = parse(usfm, { validate: false });
try {
  writeFileSync(outUsx, roughPrettyXml(r.toUsx()), 'utf8');
  writeFileSync(outVref, JSON.stringify(r.toVref(), null, 2) + '\n', 'utf8');
  writeFileSync(outUsj, JSON.stringify(usjPayload(r.toUsj()), null, 2) + '\n', 'utf8');
} finally {
  r.free();
}
