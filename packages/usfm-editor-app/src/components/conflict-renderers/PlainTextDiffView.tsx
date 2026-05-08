/**
 * Inline diff renderer.
 * Red background/strike-through for deletions, green underline for additions.
 * Used for .txt, .md, .json, .csv, and as the fallback for unknown extensions.
 */

export interface PlainTextDiffViewProps {
  oursText: string;
  theirsText: string;
  baseText?: string;
  oursLabel?: string;
  theirsLabel?: string;
  baseLabel?: string;
}

// ---------------------------------------------------------------------------
// Minimal line-level diff (no external dep fight)
// ---------------------------------------------------------------------------

type DiffOp = 'equal' | 'delete' | 'insert';

function lineDiff(a: string, b: string): Array<{ op: DiffOp; text: string }> {
  const aLines = a.split('\n');
  const bLines = b.split('\n');

  // LCS-based diff
  const m = aLines.length;
  const n = bLines.length;

  // Build DP table
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (aLines[i] === bLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: Array<{ op: DiffOp; text: string }> = [];
  let i = 0;
  let j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && aLines[i] === bLines[j]) {
      result.push({ op: 'equal', text: aLines[i] + '\n' });
      i++;
      j++;
    } else if (j < n && (i >= m || dp[i + 1][j] >= dp[i][j + 1])) {
      result.push({ op: 'insert', text: bLines[j] + '\n' });
      j++;
    } else {
      result.push({ op: 'delete', text: aLines[i] + '\n' });
      i++;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Components
// ---------------------------------------------------------------------------

export function PlainTextDiffView({
  oursText,
  theirsText,
  baseText,
  oursLabel = 'Yours',
  theirsLabel = 'Theirs',
  baseLabel = 'Base',
}: PlainTextDiffViewProps) {
  return (
    <div className="usfm-diff-plain">
      {baseText !== undefined && baseText !== '' && (
        <div className="usfm-diff-pane">
          <div className="usfm-diff-pane-label">{baseLabel}</div>
          <pre dir="auto" className="usfm-diff-pane-pre usfm-diff-pane-base">
            {baseText}
          </pre>
        </div>
      )}
      <div className="usfm-diff-plain-sides">
        <DiffPane label={oursLabel} from={theirsText} to={oursText} />
        <DiffPane label={theirsLabel} from={oursText} to={theirsText} />
      </div>
    </div>
  );
}

function DiffPane({ label, from, to }: { label: string; from: string; to: string }) {
  const diffs = lineDiff(from, to);
  return (
    <div className="usfm-diff-pane">
      <div className="usfm-diff-pane-label">{label}</div>
      <pre dir="auto" className="usfm-diff-pane-pre">
        {diffs.map(({ op, text }, i) => {
          if (op === 'delete')
            return (
              <del key={i} className="usfm-diff-del">
                {text}
              </del>
            );
          if (op === 'insert')
            return (
              <ins key={i} className="usfm-diff-ins">
                {text}
              </ins>
            );
          return <span key={i}>{text}</span>;
        })}
      </pre>
    </div>
  );
}
