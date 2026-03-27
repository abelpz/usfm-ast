import { USFMParser } from '../src/parser/index';

function nodesJson(parser: USFMParser) {
  return JSON.parse(JSON.stringify(parser.getNodes()));
}

describe('USFM Parser - Consecutive Markers', () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  describe('Structural markers with spaces (recommended USFM)', () => {
    it('parses \\id … \\c … \\p … \\v with no warnings', () => {
      const input = String.raw`\id TIT \c 1 \p \v 1 Text`;
      parser.clearLogs();
      parser.load(input).parse();
      expect(parser.getLogs()).toHaveLength(0);

      const nodes = nodesJson(parser);
      expect(nodes).toEqual([
        {
          type: 'book',
          marker: 'id',
          code: 'TIT',
          content: [],
        },
        {
          type: 'chapter',
          marker: 'c',
          number: '1',
          sid: 'TIT 1',
        },
        {
          type: 'para',
          marker: 'p',
          content: [
            {
              type: 'verse',
              marker: 'v',
              number: '1',
              sid: 'TIT 1:1',
            },
            'Text',
          ],
        },
      ]);
    });

    it('parses multiple chapters separated by newlines', () => {
      const input = ['\\id GEN', '\\c 1', '\\c 2', '\\p content'].join('\n');
      parser.clearLogs();
      parser.load(input).parse();
      expect(parser.getLogs()).toHaveLength(0);

      const nodes = nodesJson(parser);
      expect(nodes).toHaveLength(4);
      expect(nodes[0]).toMatchObject({ type: 'book', marker: 'id', code: 'GEN' });
      expect(nodes[1]).toMatchObject({ type: 'chapter', marker: 'c', number: '1' });
      expect(nodes[2]).toMatchObject({ type: 'chapter', marker: 'c', number: '2' });
      expect(nodes[3]).toMatchObject({ type: 'para', marker: 'p', content: ['content'] });
    });
  });

  describe('Error cases that should be detected', () => {
    it('should detect when characters appear outside paragraphs', () => {
      const input = 'orphan text at start \\id TIT \\p content';
      parser.clearLogs();
      parser.load(input).parse();
      const logs = parser.getLogs();

      expect(logs.length).toBeGreaterThan(0);
      expect(
        logs.some((log) => log.message.includes('Unexpected character outside a paragraph'))
      ).toBe(true);
    });
  });
});
