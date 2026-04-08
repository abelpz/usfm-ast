import { AgentOrchestrator, HeadlessCollabSession, InProcessRelay } from '../dist';

const SAMPLE = String.raw`\id TIT EN_ULT
\h Titus
\c 1
\p
\v 1 Paul, a servant of God,
\v 2 In hope of eternal life.
`;

const SAMPLE_TWO_CH = String.raw`\id TIT EN_ULT
\h Titus
\c 1
\p
\v 1 One one.
\v 2 Two two.
\c 2
\p
\v 1 Chap two v1.
`;

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function expectConvergence(sessions: HeadlessCollabSession[], settleMs = 120): Promise<void> {
  await wait(settleMs);
  const first = JSON.stringify(sessions[0]!.toUSJ());
  for (const s of sessions) {
    expect(JSON.stringify(s.toUSJ())).toBe(first);
  }
}

describe('HeadlessCollabSession offline (InProcessRelay)', () => {
  it('converges on overlapping edits to the same verse', async () => {
    const relay = new InProcessRelay();
    const a = new HeadlessCollabSession({
      userId: 'a',
      realtimeTransport: relay.createTransport({ displayName: 'A' }),
    });
    const b = new HeadlessCollabSession({
      userId: 'b',
      realtimeTransport: relay.createTransport({ displayName: 'B' }),
    });
    try {
      a.loadUSFM(SAMPLE);
      b.loadUSFM(SAMPLE);
      await a.connect('room-overlap');
      await b.connect('room-overlap');
      a.editVerse(1, 1, 'A line.');
      // Flush InProcessRelay microtasks so B applies A's remote entry before editing the same verse.
      await wait(0);
      b.editVerse(1, 1, 'B line.');
      await expectConvergence([a, b], 150);
    } finally {
      a.destroy();
      b.destroy();
      relay.dispose();
    }
  });

  it('converges with concurrent edits on different verses', async () => {
    const relay = new InProcessRelay();
    const a = new HeadlessCollabSession({
      userId: 'a',
      realtimeTransport: relay.createTransport({ displayName: 'A' }),
    });
    const b = new HeadlessCollabSession({
      userId: 'b',
      realtimeTransport: relay.createTransport({ displayName: 'B' }),
    });
    try {
      a.loadUSFM(SAMPLE);
      b.loadUSFM(SAMPLE);
      await a.connect('room-concurrent');
      await b.connect('room-concurrent');
      await Promise.all([
        Promise.resolve().then(() => {
          a.editVerse(1, 1, 'Edited A.');
        }),
        Promise.resolve().then(() => {
          b.editVerse(1, 2, 'Edited B.');
        }),
      ]);
      await expectConvergence([a, b], 150);
    } finally {
      a.destroy();
      b.destroy();
      relay.dispose();
    }
  });

  it('converges with simultaneous edits in two chapters', async () => {
    const relay = new InProcessRelay();
    const a = new HeadlessCollabSession({
      userId: 'a',
      realtimeTransport: relay.createTransport({ displayName: 'A' }),
    });
    const b = new HeadlessCollabSession({
      userId: 'b',
      realtimeTransport: relay.createTransport({ displayName: 'B' }),
    });
    try {
      a.loadUSFM(SAMPLE_TWO_CH);
      b.loadUSFM(SAMPLE_TWO_CH);
      await a.connect('room-2ch');
      await b.connect('room-2ch');
      a.editVerse(1, 2, 'Ch1 v2 by A.');
      b.editVerse(2, 1, 'Ch2 v1 by B.');
      await expectConvergence([a, b], 150);
    } finally {
      a.destroy();
      b.destroy();
      relay.dispose();
    }
  });

  it('converges with three sessions', async () => {
    const relay = new InProcessRelay();
    const sessions = ['a', 'b', 'c'].map((uid) =>
      new HeadlessCollabSession({
        userId: uid,
        realtimeTransport: relay.createTransport({ displayName: uid.toUpperCase() }),
      })
    );
    try {
      for (const s of sessions) s.loadUSFM(SAMPLE);
      await Promise.all(sessions.map((s) => s.connect('room-3')));
      sessions[0]!.editVerse(1, 1, 'By A.');
      await wait(40);
      sessions[1]!.editVerse(1, 2, 'By B.');
      await wait(40);
      sessions[2]!.editVerse(1, 1, 'By C on v1.');
      await expectConvergence(sessions, 200);
    } finally {
      for (const s of sessions) s.destroy();
      relay.dispose();
    }
  });

  it('AgentOrchestrator awaitConvergence succeeds', async () => {
    const orch = new AgentOrchestrator({
      usfm: SAMPLE,
      agents: [{ agentId: 'ag1' }, { agentId: 'ag2' }],
      roomId: 'orch-room',
    });
    try {
      await orch.start();
      orch.getSession('ag1').editVerse(1, 1, 'Agent 1.');
      orch.getSession('ag2').editVerse(1, 2, 'Agent 2.');
      const u = await orch.awaitConvergence(15_000);
      expect(u).toBeDefined();
      expect(JSON.stringify(orch.getSession('ag1').toUSJ())).toBe(JSON.stringify(u));
    } finally {
      orch.destroy();
    }
  });

  it('handles rapid-fire edits from two sessions', async () => {
    const relay = new InProcessRelay();
    const a = new HeadlessCollabSession({
      userId: 'a',
      realtimeTransport: relay.createTransport({ displayName: 'A' }),
    });
    const b = new HeadlessCollabSession({
      userId: 'b',
      realtimeTransport: relay.createTransport({ displayName: 'B' }),
    });
    try {
      a.loadUSFM(SAMPLE);
      b.loadUSFM(SAMPLE);
      await a.connect('room-stress');
      await b.connect('room-stress');
      for (let i = 0; i < 12; i++) {
        if (i % 2 === 0) a.editVerse(1, 1, `Stress A ${i}.`);
        else b.editVerse(1, 2, `Stress B ${i}.`);
      }
      await expectConvergence([a, b], 250);
    } finally {
      a.destroy();
      b.destroy();
      relay.dispose();
    }
  });
});
