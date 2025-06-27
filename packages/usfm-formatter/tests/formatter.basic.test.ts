import { USFMFormatter } from '../src/formatters/Formatter';

describe('USFMFormatter (simplified API)', () => {
  it('default: verse stays on same line', () => {
    const fmt = new USFMFormatter();
    const ws = fmt.formatMarker('v', 'character', { previousMarker: 'p' });
    expect(ws.before).toBe(' ');
    expect(ws.after).toBe(' ');
  });

  it('versesOnNewLine option', () => {
    const fmt = new USFMFormatter({ versesOnNewLine: true });
    const ws = fmt.formatMarker('v', 'character', { previousMarker: 'p' });
    expect(ws.before).toBe('\n');
    expect(ws.after).toBe(' ');
  });

  it('paragraphsOnNewLine option adds beforeContent newline', () => {
    const fmt = new USFMFormatter({ paragraphsOnNewLine: true });
    const ws = fmt.formatMarker('p', 'paragraph', { isDocumentStart: false });
    expect(ws.before).toBe('\n');
    expect(ws.beforeContent).toBe('\n');
  });
});
