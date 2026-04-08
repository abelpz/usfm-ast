/**
 * Scripted multi-session collaboration scenarios (tests / tooling).
 */

import type { UsjDocument } from '../document-store';
import { HeadlessCollabSession } from '../headless-collab-session';
import { InProcessRelay } from '../sync/in-process-transport';

export interface CollabScenario {
  usfm: string;
  participants: Array<{
    userId: string;
    edits: Array<{ chapter: number; verse: number; text: string; delayMs?: number }>;
  }>;
}

/**
 * Run concurrent edits from multiple headless sessions on a shared {@link InProcessRelay}.
 */
export async function runCollabScenario(scenario: CollabScenario): Promise<{
  converged: boolean;
  results: Array<{ userId: string; usj: UsjDocument }>;
}> {
  const relay = new InProcessRelay();
  const sessions: HeadlessCollabSession[] = [];
  const roomId = 'test-room';

  try {
    for (const p of scenario.participants) {
      const t = relay.createTransport({ displayName: p.userId });
      const s = new HeadlessCollabSession({
        userId: p.userId,
        realtimeTransport: t,
      });
      s.loadUSFM(scenario.usfm);
      sessions.push(s);
      await s.connect(roomId);
    }

    await Promise.all(
      scenario.participants.flatMap((p, i) =>
        p.edits.map(async (ed) => {
          if (ed.delayMs) await new Promise((r) => setTimeout(r, ed.delayMs));
          sessions[i]!.editVerse(ed.chapter, ed.verse, ed.text);
        })
      )
    );

    await new Promise((r) => setTimeout(r, 50));

    const results = sessions.map((s, i) => ({
      userId: scenario.participants[i]!.userId,
      usj: s.toUSJ(),
    }));

    const first = JSON.stringify(results[0]?.usj ?? null);
    const converged = results.every((r) => JSON.stringify(r.usj) === first);

    return { converged, results };
  } finally {
    for (const s of sessions) s.destroy();
    relay.dispose();
  }
}
