import { USFMParser } from '../src/parser/index';

describe('USFM Parser - Consecutive Markers', () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  describe('Consecutive paragraph markers without spaces', () => {
    it('should parse \\id TIT\\c 1\\p\\v 1 Text correctly', () => {
      const input = '\\id TIT\\c 1\\p\\v 1 Text';
      const result = parser.load(input).parse();
      const nodes = result.getNodes();
      const logs = result.getLogs();

      // Parser should handle consecutive markers without warnings
      expect(logs).toHaveLength(0);

      // Show what the parser actually produces (for debugging)
      console.log('Actual nodes:', nodes.length);
      nodes.forEach((node, i) => {
        console.log(`Node ${i}:`, {
          type: node.type,
          marker: node.marker,
          contentLength: Array.isArray(node.content) ? node.content.length : 'N/A',
        });
      });

      // Should have exactly 3 nodes: id, c, p
      expect(nodes).toHaveLength(3);

      // Node 0: \id paragraph with content "TIT"
      expect(nodes[0]).toMatchObject({
        type: 'paragraph',
        marker: 'id',
        content: [
          {
            type: 'text',
            content: 'TIT',
          },
        ],
      });

      // Node 1: \c paragraph with content "1"
      expect(nodes[1]).toMatchObject({
        type: 'paragraph',
        marker: 'c',
        content: [
          {
            type: 'text',
            content: '1',
          },
        ],
      });

      // Node 2: \p paragraph with verse and text content
      expect(nodes[2]).toMatchObject({
        type: 'paragraph',
        marker: 'p',
        content: [
          {
            type: 'character',
            marker: 'v',
            content: [
              {
                type: 'text',
                content: '1',
              },
            ],
          },
          {
            type: 'text',
            content: 'Text',
          },
        ],
      });
    });

    it('should parse \\id GEN\\c 1\\c 2\\p content correctly', () => {
      const input = '\\id GEN\\c 1\\c 2\\p content';
      const result = parser.load(input).parse();
      const nodes = result.getNodes();
      const logs = result.getLogs();

      // Should not have any warnings or errors
      expect(logs).toHaveLength(0);

      // Should have exactly 4 nodes: id, c, c, p
      expect(nodes).toHaveLength(4);

      expect(nodes[0]?.marker).toBe('id');
      expect((nodes[0]?.content?.[0] as any)?.content).toBe('GEN');

      expect(nodes[1]?.marker).toBe('c');
      expect((nodes[1]?.content?.[0] as any)?.content).toBe('1');

      expect(nodes[2]?.marker).toBe('c');
      expect((nodes[2]?.content?.[0] as any)?.content).toBe('2');

      expect(nodes[3]?.marker).toBe('p');
      expect((nodes[3]?.content?.[0] as any)?.content).toBe('content');
    });

    it('should handle consecutive markers with spaces correctly', () => {
      const input = '\\id TIT \\c 1 \\p \\v 1 Text';
      const result = parser.load(input).parse();
      const nodes = result.getNodes();
      const logs = result.getLogs();

      // Should not have any warnings or errors
      expect(logs).toHaveLength(0);

      // Should have exactly 3 nodes
      expect(nodes).toHaveLength(3);

      // Content should be parsed the same way as without spaces
      expect((nodes[0]?.content?.[0] as any)?.content).toBe('TIT');
      expect((nodes[1]?.content?.[0] as any)?.content).toBe('1');
      expect(nodes[2].content).toHaveLength(2); // verse + text
    });
  });

  describe('Error cases that should be detected', () => {
    it('should detect when characters appear outside paragraphs', () => {
      const input = 'orphan text at start \\id TIT \\p content';
      const result = parser.load(input).parse();
      const logs = result.getLogs();

      // Should have a warning about orphan text at the beginning
      expect(logs.length).toBeGreaterThan(0);
      expect(
        logs.some((log) => log.message.includes('Unexpected character outside a paragraph'))
      ).toBe(true);
    });
  });
});
