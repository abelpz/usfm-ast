/** @jest-environment jsdom */

jest.mock('@usfm-tools/editor-core', () => {
  const actual = jest.requireActual('@usfm-tools/editor-core') as typeof import('@usfm-tools/editor-core');
  return {
    ...actual,
    HeadlessCollabSession: jest
      .fn()
      .mockImplementation((opts: unknown) => new actual.HeadlessCollabSession(opts as never)),
  };
});

import {
  HeadlessCollabSession,
  InProcessRelay,
  InProcessTransport,
  MemoryJournalStore,
  OTMergeStrategy,
} from '@usfm-tools/editor-core';
import type { JournalEntry, JournalRemoteTransport } from '@usfm-tools/editor-core';

import { TextSelection } from 'prosemirror-state';

import type { ChapterLabelCommitContext } from '../src/editor';
import { DefaultMarkerRegistry } from '../src/marker-registry';
import { ScriptureSession } from '../src/scripture-session';

describe('ScriptureSession option forwarding', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes journalStore, mergeStrategy, remoteTransport, onConflict into HeadlessCollabSession', () => {
    const el = document.createElement('div');
    const relay = new InProcessRelay();
    const transport = new InProcessTransport(relay);
    const journalStore = new MemoryJournalStore();
    const mergeStrategy = new OTMergeStrategy();
    const remoteTransport: JournalRemoteTransport = {
      pullEntriesSince: async () => [] as JournalEntry[],
      pushEntries: async () => {},
    };
    const onConflict = () => 'manual' as const;

    const session = new ScriptureSession(el, {
      realtime: { transport },
      journalStore,
      mergeStrategy,
      remoteTransport,
      onConflict,
    });

    expect(HeadlessCollabSession).toHaveBeenCalledWith(
      expect.objectContaining({
        journalStore,
        mergeStrategy,
        remoteTransport,
        onConflict,
      })
    );
    session.contentView.destroy();
  });

  it('exposes markerRegistry on session.markers', () => {
    const el = document.createElement('div');
    class TaggedRegistry extends DefaultMarkerRegistry {
      readonly tag = 'tagged';
    }
    const reg = new TaggedRegistry();
    const session = new ScriptureSession(el, { markerRegistry: reg });
    expect(session.markers).toBe(reg);
    expect((session.markers as TaggedRegistry).tag).toBe('tagged');
    session.contentView.destroy();
  });
});

describe('ScriptureSession onChapterLabelCommit', () => {
  it('invokes custom handler with oldChapter and draftRaw; skips default relocate', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const calls: ChapterLabelCommitContext[] = [];
    const session = new ScriptureSession(el, {
      onChapterLabelCommit: (ctx, s) => {
        calls.push(ctx);
        s.rebuildEditorDoc();
      },
    });
    session.loadUSFM('\\id XX\n\\c 1\n\\p\n\\v 1 Hi.');
    const inner = session.contentView.dom.querySelector(
      '.usfm-chapter-label-inner'
    ) as HTMLElement | null;
    expect(inner).toBeTruthy();
    inner!.setAttribute('tabindex', '0');
    inner!.focus();
    expect(document.activeElement).toBe(inner);
    inner!.textContent = '99';
    inner!.blur();
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });
    await new Promise<void>((r) => {
      setTimeout(r, 0);
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.oldChapter).toBe(1);
    expect(calls[0]!.draftRaw).toBe('99');
    expect(session.store.getChapter(99)).toBeUndefined();
    expect(session.store.getChapter(1)).toBeDefined();
    session.contentView.destroy();
    document.body.removeChild(el);
  });
});

describe('ScriptureSession paginated navigation', () => {
  it('lists introduction even when the loaded USFM has no introduction markers', () => {
    const el = document.createElement('div');
    const session = new ScriptureSession(el, { paginatedEditor: true });
    session.loadUSFM('\\id MAT test\n\\c 1\n\\p\n\\v 1 Hi.');
    const pages = session.getNavigableContentPages();
    expect(pages.map((p) => p.kind)).toEqual(['identification', 'introduction', 'chapter']);
    expect(pages[2]).toEqual({ kind: 'chapter', chapter: 1 });
    session.contentView.destroy();
  });

  it('applyLiveUsfmFromVisibleWindow merges identification without dropping chapter 1', () => {
    const el = document.createElement('div');
    const session = new ScriptureSession(el, { paginatedEditor: true });
    session.loadUSFM('\\id TIT EN ULT\n\\h Titus\n\\c 1\n\\p\n\\v 1 Hello verse one.\n');
    session.setContentPage({ kind: 'identification' });
    session.applyLiveUsfmFromVisibleWindow('\\id TIT EN ULT r3\n\\h Titus edited\n');
    session.setContentPage({ kind: 'chapter', chapter: 1 });
    const blob = JSON.stringify(session.store.getFullUSJ().content);
    expect(blob).toContain('Hello verse one');
    expect(blob).toContain('edited');
    session.contentView.destroy();
  });

  it('applyLiveUsfmFromVisibleWindow merges chapter slice without wiping book identification', () => {
    const el = document.createElement('div');
    const session = new ScriptureSession(el, { paginatedEditor: true });
    session.loadUSFM('\\id TIT EN ULT\n\\h KeepMe\n\\c 1\n\\p\n\\v 1 One.\n');
    session.setContentPage({ kind: 'chapter', chapter: 1 });
    session.applyLiveUsfmFromVisibleWindow('\\c 1\n\\p\n\\v 1 Two.\n');
    session.setContentPage({ kind: 'identification' });
    const blob = JSON.stringify(session.store.getFullUSJ().content);
    expect(blob).toContain('KeepMe');
    expect(blob).toContain('Two');
    session.contentView.destroy();
  });

  it('applyLiveUsfmFromVisibleWindow merges chapter body when the slice omits \\c', () => {
    const el = document.createElement('div');
    const session = new ScriptureSession(el, { paginatedEditor: true });
    session.loadUSFM('\\id TIT EN ULT\n\\h KeepMe\n\\c 1\n\\p\n\\v 1 One.\n');
    session.setContentPage({ kind: 'chapter', chapter: 1 });
    session.applyLiveUsfmFromVisibleWindow('\\p\n\\v 1 Slice without chapter marker.\n');
    const blob = JSON.stringify(session.store.getFullUSJ().content);
    expect(blob).toContain('KeepMe');
    expect(blob).toContain('Slice without chapter marker');
    session.contentView.destroy();
  });

  it('blocks insert next chapter when that chapter already exists in the full book', () => {
    const el = document.createElement('div');
    const session = new ScriptureSession(el, { paginatedEditor: true, contextChapters: 0 });
    session.loadUSFM('\\id XX\n\\c 1\n\\p\n\\v 1 A\n\\c 2\n\\p\n\\v 1 B');
    session.setContentPage({ kind: 'chapter', chapter: 1 });
    expect(session.canInsertNextChapter()).toBe(false);
    expect(session.tryInsertNextChapter()).toBe(false);
    session.contentView.destroy();
  });

  it('after inserting next chapter in paginated mode, navigates to the new chapter page', () => {
    const el = document.createElement('div');
    const session = new ScriptureSession(el, { paginatedEditor: true, contextChapters: 0 });
    session.loadUSFM('\\id XX\n\\c 1\n\\p\n\\v 1 Only.');
    session.setContentPage({ kind: 'chapter', chapter: 1 });
    expect(session.canInsertNextChapter()).toBe(true);
    let caret = 1;
    session.contentView.state.doc.descendants((node, pos) => {
      if (node.type.name === 'paragraph') {
        caret = pos + 2;
        return false;
      }
    });
    session.contentView.dispatch(
      session.contentView.state.tr.setSelection(TextSelection.create(session.contentView.state.doc, caret))
    );
    expect(session.tryInsertNextChapter()).toBe(true);
    expect(session.getContentPage()).toEqual({ kind: 'chapter', chapter: 2 });
    session.contentView.destroy();
  });
});
