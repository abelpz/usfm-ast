import { useMemo, useState } from 'react';
import type { ChapterConflict } from '@usfm-tools/editor-core';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

export function ChapterConflictReviewPanel({
  conflicts,
  onClose,
}: {
  conflicts: ChapterConflict[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'content' | 'alignment'>('content');
  const content = useMemo(() => conflicts.filter((c) => c.layer === 'content'), [conflicts]);
  const alignment = useMemo(() => conflicts.filter((c) => c.layer === 'alignment'), [conflicts]);
  const active = tab === 'content' ? content : alignment;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden border rounded-md bg-background">
      <div className="px-4 py-3 border-b">
        <h2 className="text-lg font-semibold">Sync conflicts</h2>
        <p className="text-sm text-muted-foreground">
          Review chapter-level conflicts from the sync engine.
        </p>
      </div>

      <div className="px-4 py-2 border-b flex items-center gap-2">
        <Button
          size="sm"
          variant={tab === 'content' ? 'default' : 'outline'}
          onClick={() => setTab('content')}
        >
          Content ({content.length})
        </Button>
        <Button
          size="sm"
          variant={tab === 'alignment' ? 'default' : 'outline'}
          onClick={() => setTab('alignment')}
        >
          Alignment ({alignment.length})
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0 p-4">
        {active.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No conflicts in this tab.</p>
        ) : (
          <div className="space-y-4">
            {active.map((c, idx) => (
              <div key={`${c.chapter}-${c.layer}-${idx}`} className="border rounded-md overflow-hidden">
                <div className="px-3 py-2 border-b bg-muted/40 text-xs font-medium">
                  Chapter {c.chapter} · {c.layer}
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-2 p-2">
                  {tab === 'content' ? (
                    <>
                      <div className="border rounded p-2">
                        <p className="text-[11px] font-medium text-muted-foreground mb-1">Local ops</p>
                        <pre className="text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(c.localOps ?? [], null, 2)}</pre>
                      </div>
                      <div className="border rounded p-2">
                        <p className="text-[11px] font-medium text-muted-foreground mb-1">Remote ops</p>
                        <pre className="text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(c.remoteOps ?? [], null, 2)}</pre>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="border rounded p-2">
                        <p className="text-[11px] font-medium text-muted-foreground mb-1">Local alignments</p>
                        <pre className="text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(c.localAlignments ?? {}, null, 2)}</pre>
                      </div>
                      <div className="border rounded p-2">
                        <p className="text-[11px] font-medium text-muted-foreground mb-1">Remote alignments</p>
                        <pre className="text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(c.remoteAlignments ?? {}, null, 2)}</pre>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="px-4 py-3 border-t bg-muted/20">
        <Button size="sm" onClick={onClose}>Close</Button>
      </div>
    </div>
  );
}
