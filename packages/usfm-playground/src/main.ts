import { EditorView } from '@codemirror/view';
import { convert, type InputMode } from './convert';
import { createEditor, setDoc, setLanguage, type EditorLang } from './editor';
import { SAMPLE_BY_MODE } from './samples';
import './style.css';

function modeToInputLang(mode: InputMode): EditorLang {
  if (mode === 'usj') return 'json';
  if (mode === 'usx') return 'xml';
  return 'usfm';
}

function modeToLabel(mode: InputMode): string {
  if (mode === 'usj') return 'USJ (JSON)';
  if (mode === 'usx') return 'USX (XML)';
  return 'USFM';
}

function debounce(fn: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (t !== undefined) clearTimeout(t);
    t = setTimeout(() => {
      t = undefined;
      fn();
    }, ms);
  };
}

const root = document.getElementById('app');
if (!root) throw new Error('#app missing');

root.innerHTML = `
  <header class="top">
    <h1>USFM playground</h1>
    <div class="toolbar">
      <label class="mode">
        <span>Input format</span>
        <select id="mode" aria-label="Input format">
          <option value="usfm">USFM</option>
          <option value="usj">USJ</option>
          <option value="usx">USX</option>
        </select>
      </label>
      <button type="button" id="run" title="Run conversion">Convert</button>
      <label class="auto"><input type="checkbox" id="auto" checked /> Auto on edit</label>
    </div>
  </header>
  <div class="workspace">
    <main class="panes" aria-label="Editors">
      <section class="panel panel--input">
        <div class="panel-head">
          <span class="panel-role">Input</span>
          <span class="panel-title" id="input-label">USFM</span>
          <span class="panel-hint">Edit here — parsed by @usfm-tools (USX input is validate-only)</span>
        </div>
        <div id="input-mount" class="editor-mount"></div>
      </section>
      <section class="panel panel--output">
        <div class="panel-head">
          <span class="panel-role">Result</span>
          <span class="panel-title" id="out-a-label">USJ</span>
          <span class="panel-hint panel-hint--readonly">Conversion output (read-only)</span>
        </div>
        <div id="out-a-mount" class="editor-mount"></div>
      </section>
      <section class="panel panel--output">
        <div class="panel-head">
          <span class="panel-role">Result</span>
          <span class="panel-title" id="out-b-label">USX</span>
          <span class="panel-hint panel-hint--readonly">Conversion output (read-only)</span>
        </div>
        <div id="out-b-mount" class="editor-mount"></div>
      </section>
    </main>
    <section class="debug" aria-label="Diagnostics">
      <h2>Diagnostics</h2>
      <pre id="debug-text" class="debug-pre"></pre>
    </section>
  </div>
`;

const modeSelect = root.querySelector<HTMLSelectElement>('#mode')!;
const runBtn = root.querySelector<HTMLButtonElement>('#run')!;
const autoCb = root.querySelector<HTMLInputElement>('#auto')!;
const inputLabel = root.querySelector<HTMLSpanElement>('#input-label')!;
const outALabel = root.querySelector<HTMLSpanElement>('#out-a-label')!;
const outBLabel = root.querySelector<HTMLSpanElement>('#out-b-label')!;
const debugText = root.querySelector<HTMLPreElement>('#debug-text')!;

let mode: InputMode = 'usfm';

function buildInputExtensions(onChange: () => void) {
  return [
    EditorView.updateListener.of((u) => {
      if (u.docChanged && autoCb.checked) onChange();
    }),
  ];
}

const debouncedRun = debounce(() => runConversion(), 380);

const inputMount = document.getElementById('input-mount')!;
const outAMount = document.getElementById('out-a-mount')!;
const outBMount = document.getElementById('out-b-mount')!;

const inputView = createEditor(
  inputMount,
  SAMPLE_BY_MODE.usfm,
  modeToInputLang(mode),
  false,
  buildInputExtensions(() => debouncedRun())
);

const outAView = createEditor(outAMount, '', 'json', true);
const outBView = createEditor(outBMount, '', 'xml', true);

function outLang(lang: 'json' | 'xml' | 'usfm'): EditorLang {
  return lang;
}

function runConversion() {
  const text = inputView.state.doc.toString();
  const result = convert(text, mode);

  outALabel.textContent = result.outA.label;
  outBLabel.textContent = result.outB.label;

  setDoc(outAView, result.outA.text);
  setDoc(outBView, result.outB.text);
  setLanguage(outAView, outLang(result.outA.language), true);
  setLanguage(outBView, outLang(result.outB.language), true);

  const lines: string[] = [];
  lines.push(result.ok ? 'Status: OK' : `Status: FAILED — ${result.error ?? 'error'}`);
  if (result.note) lines.push('', result.note);
  lines.push('', '— Timings (ms) —');
  lines.push(
    `  parse: ${result.timings.parseMs.toFixed(3)}`,
    `  toJSON: ${result.timings.toJsonMs.toFixed(3)}`,
    `  USFM visitor: ${result.timings.usfmVisitorMs.toFixed(3)}`,
    `  USX visitor: ${result.timings.usxVisitorMs.toFixed(3)}`
  );
  lines.push('', '— Parser logs —');
  if (result.logs.length === 0) lines.push('  (none)');
  else {
    for (const l of result.logs) {
      lines.push(`  [${l.type}] ${l.message}`);
    }
  }
  lines.push('', '— Inferred markers (not in registry) —');
  if (result.inferredMarkerNames.length === 0) lines.push('  (none)');
  else lines.push(`  ${result.inferredMarkerNames.join(', ')}`);

  lines.push('', '— Source markers not represented on USJ `marker` fields —');
  if (result.markersInSourceNotInAst.length === 0) lines.push('  (none — or N/A for this mode)');
  else lines.push(`  ${result.markersInSourceNotInAst.join(', ')}`);

  debugText.textContent = lines.join('\n');
}

runBtn.addEventListener('click', () => runConversion());

modeSelect.addEventListener('change', () => {
  mode = modeSelect.value as InputMode;
  inputLabel.textContent = modeToLabel(mode);
  const sample = SAMPLE_BY_MODE[mode];
  setLanguage(inputView, modeToInputLang(mode), false, buildInputExtensions(() => debouncedRun()));
  setDoc(inputView, sample);
  runConversion();
});

runConversion();
