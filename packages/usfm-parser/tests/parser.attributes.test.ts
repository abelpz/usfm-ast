import { USFMParser } from '../dist';

describe('USFMParser - Attributes', () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  test('parses character marker with custom attributes', () => {
    const input = String.raw`\w Paul|x-occurrence="1" x-occurrences="1"\w*`;
    const result = JSON.parse(JSON.stringify(parser.load(input).parse().getNodes()));
    expect(result).toEqual([
      {
        type: 'char',
        marker: 'w',
        content: ['Paul'],
        'x-occurrence': '1',
        'x-occurrences': '1',
      },
    ]);
  });

  describe('Default attributes', () => {
    test('parses default lemma attribute for w marker', () => {
      const input = String.raw`\w gracious|grace\w*`;
      const result = parser.load(input).parse().getNodes();
      expect(result[0]).toEqual(
        expect.objectContaining({
          type: 'char',
          marker: 'w',
          lemma: 'grace',
        })
      );
    });

    test('handles both default and explicit attributes', () => {
      const input = String.raw`\w gracious|lemma="grace" x-occurrence="1"\w*`;
      const result = parser.load(input).parse().getNodes();
      expect(result[0]).toEqual(
        expect.objectContaining({
          type: 'char',
          marker: 'w',
          lemma: 'grace',
          'x-occurrence': '1',
        })
      );
    });

    test('prioritizes explicit attributes over default', () => {
      const input = String.raw`\w gracious|lemma="different" x-occurrence="1"\w*`;
      const result = parser.load(input).parse().getNodes();
      expect(result[0]).toEqual(
        expect.objectContaining({
          type: 'char',
          marker: 'w',
          lemma: 'different',
          'x-occurrence': '1',
        })
      );
    });
  });
});
