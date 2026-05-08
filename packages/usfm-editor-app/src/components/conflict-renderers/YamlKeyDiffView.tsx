/**
 * YAML-structured diff renderer for manifest files.
 * Shows a compact list of changed keys: `key: old → new`.
 * Keys where all three sides agree are hidden.
 * Each row has its own Keep mine / Keep theirs buttons that resolve at the key level.
 * Falls back to PlainTextDiffView if YAML parsing fails.
 */

import { useState } from 'react';
import * as jsYaml from 'js-yaml';
import { PlainTextDiffView } from './PlainTextDiffView';
import { collectRows, formatVal, isPlainObj, type PlainObj } from './key-diff-shared';

export interface YamlKeyDiffViewProps {
  oursText: string;
  theirsText: string;
  baseText?: string;
  oursLabel?: string;
  theirsLabel?: string;
  baseLabel?: string;
}

export function YamlKeyDiffView({
  oursText,
  theirsText,
  baseText = '',
  oursLabel = 'Yours',
  theirsLabel = 'Theirs',
}: YamlKeyDiffViewProps) {
  // Resolved per-key choices: dotPath → 'ours' | 'theirs'
  const [choices, setChoices] = useState<Map<string, 'ours' | 'theirs'>>(new Map());

  let base: PlainObj;
  let ours: PlainObj;
  let theirs: PlainObj;
  try {
    base = ((jsYaml.load(baseText || '{}') ?? {}) as PlainObj) || {};
    ours = ((jsYaml.load(oursText) ?? {}) as PlainObj) || {};
    theirs = ((jsYaml.load(theirsText) ?? {}) as PlainObj) || {};
    if (!isPlainObj(base) || !isPlainObj(ours) || !isPlainObj(theirs)) throw new Error('not obj');
  } catch {
    return (
      <PlainTextDiffView
        oursText={oursText}
        theirsText={theirsText}
        baseText={baseText}
        oursLabel={oursLabel}
        theirsLabel={theirsLabel}
      />
    );
  }

  const rows = collectRows(base, ours, theirs);
  if (rows.length === 0) {
    return (
      <div className="usfm-diff-yaml-empty">No differences found in YAML keys.</div>
    );
  }

  function pick(dotPath: string, side: 'ours' | 'theirs') {
    setChoices((prev) => new Map(prev).set(dotPath, side));
  }

  const conflictRows = rows.filter((r) => r.conflict);
  const autoRows = rows.filter((r) => !r.conflict);

  return (
    <div className="usfm-diff-yaml text-sm">
      {autoRows.length > 0 && (
        <p className="text-xs text-muted-foreground mb-3 px-1">
          {autoRows.length} key{autoRows.length > 1 ? 's' : ''} auto-merged (only one side changed).
          {conflictRows.length > 0 && ' Choose how to resolve the remaining conflicts below.'}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="usfm-diff-yaml-table w-full border-collapse text-left">
          <thead>
            <tr className="border-b text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              <th className="py-1.5 pr-3 pl-1 w-48">Key</th>
              <th className="py-1.5 px-3">{oursLabel}</th>
              <th className="py-1.5 px-3">{theirsLabel}</th>
              <th className="py-1.5 pl-3 w-36">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const choice = choices.get(row.dotPath);
              return (
                <tr
                  key={row.dotPath}
                  className={[
                    'border-b last:border-0',
                    row.conflict ? 'bg-orange-50 dark:bg-orange-950/20' : '',
                  ].join(' ')}
                >
                  <td className="py-2 pr-3 pl-1 font-mono text-xs align-top break-all w-48">
                    {row.dotPath}
                  </td>
                  <td
                    className={[
                      'py-2 px-3 align-top break-words max-w-[200px]',
                      choice === 'ours' ? 'bg-green-100 dark:bg-green-900/30 rounded' : '',
                    ].join(' ')}
                  >
                    {formatVal(row.oursVal)}
                  </td>
                  <td
                    className={[
                      'py-2 px-3 align-top break-words max-w-[200px]',
                      choice === 'theirs' ? 'bg-blue-100 dark:bg-blue-900/30 rounded' : '',
                    ].join(' ')}
                  >
                    {formatVal(row.theirsVal)}
                  </td>
                  <td className="py-2 pl-3 align-top w-36">
                    {row.conflict ? (
                      <div className="flex flex-col gap-1">
                        <button
                          type="button"
                          className={[
                            'px-2 py-0.5 rounded text-xs border transition-colors',
                            choice === 'ours'
                              ? 'bg-green-600 text-white border-green-600'
                              : 'hover:bg-muted border-border',
                          ].join(' ')}
                          onClick={() => pick(row.dotPath, 'ours')}
                        >
                          Keep mine
                        </button>
                        <button
                          type="button"
                          className={[
                            'px-2 py-0.5 rounded text-xs border transition-colors',
                            choice === 'theirs'
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'hover:bg-muted border-border',
                          ].join(' ')}
                          onClick={() => pick(row.dotPath, 'theirs')}
                        >
                          Keep theirs
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground italic">
                        {row.oursChanged ? 'Auto: yours' : 'Auto: theirs'}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
