import { InProcessRelay } from '../dist';
import { HeadlessCollabSession } from '../dist';

const SAMPLE = String.raw`\id TIT EN_ULT
\h Titus
\c 1
\p
\v 1 Paul, a servant of God,
\v 2 In hope of eternal life.
`;

describe('HeadlessCollabSession + InProcessRelay', () => {
  it('converges after sequential edits on different verses', async () => {
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
      await a.connect('room-1');
      await b.connect('room-1');

      a.editVerse(1, 1, 'Edited by A.');
      await new Promise((r) => setTimeout(r, 30));
      b.editVerse(1, 2, 'Edited by B.');
      await new Promise((r) => setTimeout(r, 80));

      const ja = JSON.stringify(a.toUSJ());
      const jb = JSON.stringify(b.toUSJ());
      expect(ja).toBe(jb);
    } finally {
      a.destroy();
      b.destroy();
      relay.dispose();
    }
  });
});
