import type { TokenAnnotation } from '@usfm-tools/types';
import { cn } from '@/lib/utils';

function entriesByTokenIndex(annotations: TokenAnnotation[]): Map<number, TokenAnnotation['entries']> {
  const m = new Map<number, TokenAnnotation['entries']>();
  for (const a of annotations) m.set(a.tokenIndex, a.entries);
  return m;
}

type Props = {
  bookLabel: string;
  chapter: number;
  verse: number;
  tokens: string[];
  annotations: TokenAnnotation[];
  selectedTokenIndex: number | null;
  onSelectToken: (tokenIndex: number, entries: TokenAnnotation['entries']) => void;
  /** BCP 47 language tag for typography / shaping (e.g. source language from wizard). */
  lang?: string;
  /** When set, overrides `dir="auto"` for correct verse-marker placement in RTL gateways. */
  textDirection?: 'ltr' | 'rtl';
};

/**
 * Verse tokens with underlines where TWL/TN rows match (occurrence-aware).
 */
export function AnnotatedSourceText({
  bookLabel,
  chapter,
  verse,
  tokens,
  annotations,
  selectedTokenIndex,
  onSelectToken,
  lang,
  textDirection,
}: Props) {
  const byIdx = entriesByTokenIndex(annotations);
  if (tokens.length === 0) {
    return (
      <p className="text-muted-foreground text-sm italic">
        No source text for {bookLabel} {chapter}:{verse} (load a reference file with this verse).
      </p>
    );
  }
  return (
    <p
      className="text-foreground flex flex-wrap items-baseline gap-x-1 gap-y-1 leading-relaxed"
      dir={textDirection ?? 'auto'}
      lang={lang}
      data-testid="annotated-source"
    >
      <span className="text-muted-foreground shrink-0 font-mono text-xs">
        {bookLabel} {chapter}:{verse}
      </span>
      {tokens.map((tok, i) => {
        const entries = byIdx.get(i);
        const has = Boolean(entries?.length);
        const active = selectedTokenIndex === i;
        return (
          <button
            key={`${i}-${tok}`}
            type="button"
            tabIndex={0}
            disabled={!has}
            title={has ? `${entries!.length} translation help(s)` : undefined}
            onClick={() => has && entries && onSelectToken(i, entries)}
            className={cn(
              'inline min-h-[1.25em] rounded px-0.5 align-baseline text-base transition-colors',
              has && 'text-primary cursor-pointer underline decoration-2 underline-offset-4',
              !has && 'cursor-default',
              active && has && 'bg-primary/15',
            )}
          >
            {tok}
          </button>
        );
      })}
    </p>
  );
}
