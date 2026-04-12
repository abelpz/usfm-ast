/** @jest-environment jsdom */

import { createAlignmentDocument } from '@usfm-tools/editor-core';
import { ScriptureSession } from '../src/scripture-session';

const USFM_PLAIN = String.raw`\id TIT EN
\c 1
\p
\v 1 Hello world.
`;

describe('ScriptureSession multi-source alignment documents', () => {
  it('loads embedded doc on loadUSFM and registers external doc with active switch', () => {
    const el = document.createElement('div');
    const session = new ScriptureSession(el, {});
    session.loadUSFM(USFM_PLAIN);

    expect(session.getAlignmentDocumentKeys()).toContain('__embedded__');
    expect(session.getActiveAlignmentDocumentKey()).toBe('__embedded__');

    const ugnt = createAlignmentDocument(
      { id: 'TIT EN' },
      { id: 'el-x-koine/ugnt', version: '85' },
      {
        'TIT 1:1': [
          {
            sources: [
              {
                content: 'α',
                strong: 'G1',
                lemma: 'α',
                occurrence: 1,
                occurrences: 1,
              },
            ],
            targets: [{ word: 'Hello', occurrence: 1, occurrences: 1 }],
          },
        ],
      }
    );
    let docLayerEvents = 0;
    const unsubDoc = session.onAlignmentDocumentsChange(() => {
      docLayerEvents += 1;
    });

    session.loadAlignmentDocument(ugnt);
    expect(docLayerEvents).toBe(1);

    const keys = session.getAlignmentDocumentKeys();
    expect(keys.some((k) => k !== '__embedded__')).toBe(true);

    const ugntKey = keys.find((k) => k !== '__embedded__')!;
    expect(session.setActiveAlignmentDocumentKey(ugntKey)).toBe(true);
    expect(docLayerEvents).toBe(2);
    expect(session.getAlignmentsForVerse('TIT 1:1').length).toBe(1);

    expect(session.setActiveAlignmentDocumentKey('__embedded__')).toBe(true);
    expect(docLayerEvents).toBe(3);
    expect(session.getAlignmentsForVerse('TIT 1:1').length).toBe(0);

    unsubDoc();
    session.contentView.destroy();
  });

  it('toUSFM embedAlignmentSourceKey null omits zaln', () => {
    const el = document.createElement('div');
    const session = new ScriptureSession(el, {});
    session.loadUSFM(USFM_PLAIN);
    const ugnt = createAlignmentDocument(
      { id: 'TIT EN' },
      { id: 'src' },
      {
        'TIT 1:1': [
          {
            sources: [{ content: 'x', strong: 'G1', lemma: 'x', occurrence: 1, occurrences: 1 }],
            targets: [{ word: 'Hello', occurrence: 1, occurrences: 2 }],
          },
        ],
      }
    );
    session.loadAlignmentDocument(ugnt);
    const k = session.getAlignmentDocumentKeys().find((x) => x !== '__embedded__')!;
    session.setActiveAlignmentDocumentKey(k);

    const withAlign = session.toUSFM();
    expect(withAlign.toLowerCase()).toMatch(/zaln-s|\\\\zaln-s/i);

    const plain = session.toUSFM(undefined, { embedAlignmentSourceKey: null });
    expect(plain).not.toMatch(/zaln-s/i);

    session.contentView.destroy();
  });
});
