/**
 * In-process realtime (OT) plus DCS journal transport pull — no relay server required.
 * Optional: set `RELAY_URL` + run a relay to swap in `WebSocketRelayTransport` (skipped here by default).
 */

import {
  createDcsJournalTransport,
  HeadlessCollabSession,
  InProcessRelay,
} from '../../dist';
import { getDoor43Config, shouldRunDoor43ReadTests } from '../helpers/door43-env';

const SAMPLE = String.raw`\id TIT EN_ULT
\h Titus
\c 1
\p
\v 1 Alpha.
\v 2 Beta.
`;

const describeDoor43 = shouldRunDoor43ReadTests() ? describe : describe.skip;

function makeRemote() {
  const cfg = getDoor43Config()!;
  return createDcsJournalTransport({
    baseUrl: cfg.baseUrl,
    token: cfg.token,
    owner: cfg.owner,
    repo: cfg.repo,
    branch: cfg.branch,
    path: cfg.journalPath,
  });
}

describeDoor43('Realtime collaboration + DCS journal pull', () => {
  it('two headless sessions converge over InProcessRelay and pull from DCS without throwing', async () => {
    const relay = new InProcessRelay();
    const a = new HeadlessCollabSession({
      userId: 'a',
      remoteTransport: makeRemote(),
      realtimeTransport: relay.createTransport({ displayName: 'A' }),
    });
    const b = new HeadlessCollabSession({
      userId: 'b',
      remoteTransport: makeRemote(),
      realtimeTransport: relay.createTransport({ displayName: 'B' }),
    });
    try {
      a.loadUSFM(SAMPLE);
      b.loadUSFM(SAMPLE);
      await a.connect('rt-dcs-room');
      await b.connect('rt-dcs-room');
      a.editVerse(1, 1, 'Edited A.');
      await new Promise((r) => setTimeout(r, 40));
      b.editVerse(1, 2, 'Edited B.');
      await new Promise((r) => setTimeout(r, 120));
      expect(JSON.stringify(a.toUSJ())).toBe(JSON.stringify(b.toUSJ()));

      const pa = await a.sync.pull();
      const pb = await b.sync.pull();
      expect(['ok', 'offline', 'error', 'conflicts']).toContain(pa.status);
      expect(['ok', 'offline', 'error', 'conflicts']).toContain(pb.status);
    } finally {
      a.destroy();
      b.destroy();
      relay.dispose();
    }
  });
});
