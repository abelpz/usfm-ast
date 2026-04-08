import { USFMParser } from '@usfm-tools/parser';
import { createUSFMEditorState } from '../src/editor';
import { nextChapterNumberForSelection } from '../src/chapter-number';

describe('nextChapterNumberForSelection', () => {
  it('returns max+1 when the doc has only the implicit single chapter', () => {
    const parser = new USFMParser();
    parser.parse('\\id XX X\n');
    const state = createUSFMEditorState(parser.toJSON());
    expect(nextChapterNumberForSelection(state)).toBe('2');
  });

  it('returns max+1 for existing chapters', () => {
    const parser = new USFMParser();
    parser.parse('\\id XX X\n\\c 1\n\\p\n\\v 1 Hi.\n\\c 3\n\\p\n\\v 1 There.');
    const state = createUSFMEditorState(parser.toJSON());
    expect(nextChapterNumberForSelection(state)).toBe('4');
  });
});
