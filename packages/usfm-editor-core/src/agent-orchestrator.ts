/**
 * Multi-agent translation orchestration over shared {@link HeadlessCollabSession} instances.
 */

import type { UsjDocument } from './document-store';
import type { ChapterConflict } from './sync/types';
import { HeadlessCollabSession } from './headless-collab-session';
import { InProcessRelay } from './sync/in-process-transport';
import type { RealtimeTransport } from './sync/realtime-transport';

export interface AgentTask {
  agentId: string;
  chapters?: number[];
  verses?: Array<{ chapter: number; verse: number }>;
}

export interface AgentOrchestratorOptions {
  usfm: string;
  agents: AgentTask[];
  /** Defaults to in-process relay when omitted. */
  transport?: 'in-process' | RealtimeTransport;
  /** Realtime room id for all agent sessions. */
  roomId?: string;
  onProgress?: (agentId: string, chapter: number, verse: number) => void;
  onConflict?: (conflict: ChapterConflict) => void;
}

/**
 * Holds one {@link HeadlessCollabSession} per agent, all on the same realtime room.
 */
export class AgentOrchestrator {
  private readonly relay: InProcessRelay | null;
  private readonly sessions = new Map<string, HeadlessCollabSession>();
  private readonly completed = new Set<string>();
  private disposed = false;
  private started = false;

  constructor(private readonly opts: AgentOrchestratorOptions) {
    if (
      opts.transport &&
      opts.transport !== 'in-process' &&
      opts.agents.length > 1
    ) {
      throw new Error(
        'AgentOrchestrator: use transport "in-process" (default) when multiple agents share a room'
      );
    }
    const useRelay = opts.transport === undefined || opts.transport === 'in-process';
    this.relay = useRelay ? new InProcessRelay() : null;

    for (const agent of opts.agents) {
      const rt: RealtimeTransport | undefined =
        opts.transport && opts.transport !== 'in-process'
          ? opts.transport
          : this.relay!.createTransport({ displayName: agent.agentId });

      const session = new HeadlessCollabSession({
        userId: agent.agentId,
        realtimeTransport: rt,
      });
      session.loadUSFM(opts.usfm);
      this.sessions.set(agent.agentId, session);
    }
  }

  /** Connect all sessions to the shared room (required before editing). */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;
    const roomId = this.opts.roomId ?? 'agents';
    await Promise.all(
      [...this.sessions.values()].map((s) => s.connect(roomId))
    );
  }

  getSession(agentId: string): HeadlessCollabSession {
    const s = this.sessions.get(agentId);
    if (!s) throw new Error(`Unknown agent: ${agentId}`);
    return s;
  }

  markComplete(agentId: string): void {
    this.completed.add(agentId);
  }

  async awaitConvergence(timeoutMs = 30_000): Promise<UsjDocument> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const list = [...this.sessions.values()];
      if (list.length === 0) throw new Error('No sessions');
      const first = JSON.stringify(list[0]!.toUSJ());
      if (list.every((s) => JSON.stringify(s.toUSJ()) === first)) {
        return list[0]!.toUSJ();
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error('awaitConvergence: timeout');
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const s of this.sessions.values()) s.destroy();
    this.sessions.clear();
    this.relay?.dispose();
  }
}
