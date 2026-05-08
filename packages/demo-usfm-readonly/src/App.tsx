import { useCallback, useState } from 'react';
import {
  UsfmReadonlyView,
  type ScriptureSelectionRef,
  type WordClickPayload,
} from '@usfm-tools/usfm-readonly-react';

/** Parser fixture: `packages/usfm-parser/tests/fixtures/usfm/jonah.bsb.usfm` (BSB Jonah, 4 ch). */
import DEMO_USFM from '../../usfm-parser/tests/fixtures/usfm/jonah.bsb.usfm?raw';

type LogLine = { t: string; msg: string };

export function App() {
  const [chapter, setChapter] = useState(1);
  const [stripAlignment, setStripAlignment] = useState(true);
  const [log, setLog] = useState<LogLine[]>([]);
  const [selection, setSelection] = useState<ScriptureSelectionRef | null>(null);

  const pushLog = useCallback((msg: string) => {
    setLog((prev) => [{ t: new Date().toLocaleTimeString(), msg }, ...prev].slice(0, 14));
  }, []);

  return (
    <div>
      <header style={{ marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.35rem', margin: '0 0 0.35rem' }}>Demo — USFM solo lectura</h1>
        <p style={{ margin: 0, color: '#475569', fontSize: '0.9rem' }}>
          Paquete <code>@usfm-tools/usfm-readonly-react</code> · USFM de prueba:{' '}
          <code>usfm-parser/tests/fixtures/usfm/jonah.bsb.usfm</code> en <strong>usfm-ast</strong> (Jonás BSB:{' '}
          <code>\q1</code>/<code>\q2</code>, <code>\f</code>, <code>\pmo</code>, <code>\ref</code>, secciones{' '}
          <code>\s1</code>/<code>\r</code>). Versículo, palabra, selección y <code>stripAlignment</code>.
        </p>
      </header>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          marginBottom: '1rem',
          padding: '0.75rem',
          background: '#fff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
        }}
      >
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          Capítulo
          <select value={chapter} onChange={(e) => setChapter(Number(e.target.value))}>
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
            <option value={4}>4</option>
          </select>
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <input
            type="checkbox"
            checked={stripAlignment}
            onChange={(e) => setStripAlignment(e.target.checked)}
          />
          Quitar alineaciones (strip)
        </label>
      </div>

      <section
        style={{
          padding: '1rem',
          background: '#fff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          marginBottom: '1rem',
        }}
      >
        <UsfmReadonlyView
          usfm={DEMO_USFM}
          chapter={chapter}
          stripAlignment={stripAlignment}
          aria-label="Demostración USFM"
          onVerseClick={(n) => pushLog(`Versículo: ${n}`)}
          onWordClick={(p: WordClickPayload) =>
            pushLog(
              `Palabra: "${p.word}" @ ${p.bookCode} ${p.chapter}:${p.verseNum} · índice ${p.wordIndexInVerse} · ocurrencia ${p.occurrenceInVerse}`,
            )
          }
          onSelectionChange={(s) => {
            setSelection(s);
            if (s?.text?.trim()) pushLog(`Selección: "${s.text.slice(0, 48)}${s.text.length > 48 ? '…' : ''}" → ${s.verseStart}–${s.verseEnd}`);
          }}
        />
      </section>

      <section style={{ marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>Última selección (estructurada)</h2>
        <pre
          style={{
            margin: 0,
            padding: '0.75rem',
            background: '#0f172a',
            color: '#e2e8f0',
            borderRadius: '8px',
            fontSize: '0.8rem',
            overflow: 'auto',
          }}
        >
          {selection ? JSON.stringify(selection, null, 2) : 'null'}
        </pre>
      </section>

      <section>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.5rem' }}>Registro de eventos</h2>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '0.85rem' }}>
          {log.length === 0 ? (
            <li style={{ color: '#64748b' }}>Haz clic en un versículo o selecciona texto…</li>
          ) : (
            log.map((l, i) => (
              <li
                key={`${l.t}-${i}`}
                style={{
                  padding: '0.35rem 0',
                  borderBottom: '1px solid #e2e8f0',
                  fontFamily: 'ui-monospace, monospace',
                }}
              >
                <span style={{ color: '#94a3b8' }}>{l.t}</span> {l.msg}
              </li>
            ))
          )}
        </ul>
      </section>
    </div>
  );
}
