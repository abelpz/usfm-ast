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

  describe('An attribute with nothing in its quotes', () => {
    // As unfoldingWord writes the prefixes of Hebrew, which have no lemma of their own.
    const prefix = String.raw`\zaln-s |x-strong="b" x-lemma="" x-morph="He,R:Sp3fs" x-occurrence="1" x-occurrences="1" x-content="בָּ⁠הּ֙"\*\w en|x-occurrence="1" x-occurrences="1"\w*\zaln-e\*`;

    test('is an attribute with an empty value, and the ones after it are read as theirs', () => {
      const [start] = JSON.parse(JSON.stringify(parser.load(prefix).parse().getNodes()));
      expect(start).toEqual({
        type: 'ms',
        marker: 'zaln-s',
        'x-strong': 'b',
        'x-lemma': '',
        'x-morph': 'He,R:Sp3fs',
        'x-occurrence': '1',
        'x-occurrences': '1',
        'x-content': 'בָּ⁠הּ֙',
      });
    });

    test('at the end of the list, and alone', () => {
      const last = JSON.parse(JSON.stringify(parser.load(String.raw`\zaln-s |x-strong="b" x-lemma=""\*`).parse().getNodes()))[0];
      expect(last).toEqual({ type: 'ms', marker: 'zaln-s', 'x-strong': 'b', 'x-lemma': '' });
      const alone = JSON.parse(JSON.stringify(parser.load(String.raw`\w en|x-lemma=""\w*`).parse().getNodes()))[0];
      expect(alone).toEqual({ type: 'char', marker: 'w', content: ['en'], 'x-lemma': '' });
    });
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
