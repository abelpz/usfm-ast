import { Button } from '@/components/ui/button';
import { listBuiltInCheckingExtensions } from '@/extensions/extension-registry';
import type { ReviewStage } from '@usfm-tools/types';
import { useMemo, useState } from 'react';

export function CheckingPanel() {
  const [stages, setStages] = useState<ReviewStage[] | null>(null);
  const extensions = useMemo(() => listBuiltInCheckingExtensions(), []);

  return (
    <div className="border-border bg-muted/20 space-y-3 rounded-lg border p-4 text-sm">
      <h3 className="text-foreground font-semibold">Checking</h3>
      <p className="text-muted-foreground text-xs">
        Built-in extensions can generate stage templates. Persisted <code>checking/</code> JSON is written by future sync
        hooks.
      </p>
      <div className="flex flex-wrap gap-2">
        {extensions.map((ex) => (
          <Button
            key={ex.id}
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              const next = ex.generateStages?.({
                scopeBooks: [],
                readFile: async () => null,
                manifestSummary: { format: 'unknown' },
              });
              setStages(next ?? null);
            }}
          >
            Load: {ex.name}
          </Button>
        ))}
      </div>
      {stages?.length ? (
        <ol className="list-decimal space-y-1 pl-5 text-xs">
          {stages.map((s) => (
            <li key={s.id}>
              <span className="font-medium">{s.label}</span>
              {s.description ? <span className="text-muted-foreground"> — {s.description}</span> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-muted-foreground text-xs">No stage preview loaded.</p>
      )}
    </div>
  );
}
