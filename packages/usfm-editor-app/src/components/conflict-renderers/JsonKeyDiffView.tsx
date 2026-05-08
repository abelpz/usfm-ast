/**
 * JSON structured diff renderer.
 * Shows a compact table of changed keys (recursing into nested objects).
 * Metadata-only keys (updated, created, savedAt…) are shown as auto-merged rows.
 * Falls back to PlainTextDiffView if JSON parsing fails.
 *
 * Modeled on YamlKeyDiffView but parses with JSON.parse.
 */

import { useState } from 'react';
import { PlainTextDiffView } from './PlainTextDiffView';
import { collectRows, formatVal, isPlainObj, type PlainObj } from './key-diff-shared';

export interface JsonKeyDiffViewProps {
  oursText: string;
  theirsText: string;
  baseText?: string;
  oursLabel?: string;
  theirsLabel?: string;
  baseLabel?: string;
}

export function JsonKeyDiffView({
  oursText,
  theirsText,
  baseText = '',
  oursLabel = 'Yours',
  theirsLabel = 'Theirs',
}: JsonKeyDiffViewProps) {
  const [choices, setChoices] = useState<Map<string, 'ours' | 'theirs'>>(new Map());

  let base: PlainObj;
  let ours: PlainObj;
  let theirs: PlainObj;
  try {
    const bParsed = baseText ? (JSON.parse(baseText) as unknown) : {};
    const oParsed = JSON.parse(oursText) as unknown;
    const tParsed = JSON.parse(theirsText) as unknown;
    if (!isPlainObj(oParsed) || !isPlainObj(tParsed)) throw new Error('not obj');
    base = isPlainObj(bParsed) ? bParsed : {};
    ours = oParsed;
    theirs = tParsed;
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
      <div className="usfm-diff-json-empty text-sm text-muted-foreground p-2">
        No differences found in JSON keys.
      </div>
    );
  }

  function pick(dotPath: string, side: 'ours' | 'theirs') {
    setChoices((prev) => new Map(prev).set(dotPath, side));
  }

  const conflictRows = rows.filter((r) => r.conflict);
  const autoRows = rows.filter((r) => !r.conflict);

  return (
    <div className="usfm-diff-json text-sm">
      {autoRows.length > 0 && (
        <p className="text-xs text-muted-foreground mb-3 px-1">
          {autoRows.length} key{autoRows.length !== 1 ? 's' : ''} auto-merged (only one side changed).
          {conflictRows.length > 0 && ' Choose how to resolve the remaining conflicts below.'}
        </p>
      )}
      <div className="overflow-x-auto">
        <table className="usfm-diff-json-table w-full border-collapse text-left">
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
