import { EditorState, NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';

import { usfmSchema } from '@usfm-tools/editor';
import { buildWysiwygBubbleContext } from '../src/bubble-context';

function viewAtParagraphPos(pos: number): EditorView {
  const doc = usfmSchema.nodeFromJSON({
    type: 'doc',
    content: [
      {
        type: 'chapter',
        attrs: { n: '1' },
        content: [
          {
            type: 'paragraph',
            attrs: { marker: 'p' },
            content: [{ type: 'text', text: 'Hello' }],
          },
        ],
      },
    ],
  });
  const state = EditorState.create({
    doc,
    selection: TextSelection.create(doc, pos),
  });
  const place = document.createElement('div');
  return new EditorView(place, { state });
}

describe('buildWysiwygBubbleContext', () => {
  it('returns null for inline atom NodeSelection (verse)', () => {
    const doc = usfmSchema.nodeFromJSON({
      type: 'doc',
      content: [
        {
          type: 'chapter',
          attrs: { n: '1' },
          content: [
            {
              type: 'paragraph',
              attrs: { marker: 'p' },
              content: [
                { type: 'text', text: 'v1 ' },
                { type: 'verse', attrs: { number: '1' } },
              ],
            },
          ],
        },
      ],
    });
    let versePos = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === 'verse') {
        versePos = pos;
        return false;
      }
    });
    expect(versePos).toBeGreaterThanOrEqual(0);
    const state = EditorState.create({
      doc,
      selection: NodeSelection.create(doc, versePos),
    });
    const place = document.createElement('div');
    const view = new EditorView(place, { state });
    expect(buildWysiwygBubbleContext(view)).toBeNull();
  });

  it('reports inChapter and paragraphMarker inside chapter paragraph', () => {
    const view = viewAtParagraphPos(5);
    const ctx = buildWysiwygBubbleContext(view);
    expect(ctx).not.toBeNull();
    expect(ctx!.inChapter).toBe(true);
    expect(ctx!.paragraphMarker).toBe('p');
  });
});
