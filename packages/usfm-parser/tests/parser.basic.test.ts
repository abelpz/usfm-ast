import { USFMParser } from '../dist';
import { cleanForComparison } from './utils';

describe('USFMParser - Basic', () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
    parser.clearLogs();
  });

  afterEach(() => {
    parser.clearLogs();
  });

  test('parses paragraph marker', () => {
    const input = String.raw`\p this is a paragraph.`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'para',
        marker: 'p',
        content: ['this is a paragraph.'],
      },
    ]);
    expect(parser.getLogs()).toHaveLength(0);
  });

  test('parses verse marker', () => {
    const input = String.raw`\v 1 this is a verse.`;
    const result = parser.load(input).parse().getNodes();
    expect(JSON.parse(JSON.stringify(result))).toEqual([
      {
        type: 'verse',
        marker: 'v',
        number: '1',
      },
      'this is a verse.',
    ]);
    expect(parser.getLogs()).toHaveLength(0);
  });

  test('handles character inside note content', () => {
    const input = String.raw`\f + \ft this is a note with \bd bold\bd* text.\f*`;
    const result = JSON.parse(JSON.stringify(parser.load(input).parse().getNodes()));
    expect(result).toEqual([
      {
        type: 'note',
        marker: 'f',
        content: [
          {
            type: 'char',
            marker: 'ft',
            content: [
              'this is a note with ',
              {
                type: 'char',
                marker: 'bd',
                content: ['bold'],
              },
              ' text.',
            ],
          },
        ],
        caller: '+',
      },
    ]);
  });

  test('handles character inside note', () => {
    const input = String.raw`\f + \bd bold\bd* text.\f*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'note',
        marker: 'f',
        content: [
          {
            type: 'char',
            marker: 'bd',
            content: ['bold'],
          },
          ' text.',
        ],
        caller: '+',
      },
    ]);
  });

  test('handles milestone within root with attributes', () => {
    const input = String.raw`\ts-s |sid="ts_JUD_5-6"\*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'ms',
        marker: 'ts-s',
        sid: 'ts_JUD_5-6',
      },
    ]);
  });

  test('handles milestone within root without attributes', () => {
    const input = String.raw`\ts-s\*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([{ type: 'ms', marker: 'ts-s' }]);
  });

  test('handles milestone within paragraph', () => {
    const input = String.raw`\p \ts-s |sid="ts_JUD_5-6"\*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'para',
        marker: 'p',
        content: [
          {
            type: 'ms',
            marker: 'ts-s',
            sid: 'ts_JUD_5-6',
          },
        ],
      },
    ]);
  });

  test('handles milestone as a text if found within character', () => {
    const input = String.raw`\bd \ts-s |sid="ts_JUD_5-6"\*\bd*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'char',
        marker: 'bd',
        content: [
          {
            type: 'ms',
            marker: 'ts-s',
            sid: 'ts_JUD_5-6',
          },
        ],
      },
    ]);
  });

  test('handles standalone milestone with attributes', () => {
    const input = String.raw`\ts |sid="ts_JUD_5-6"\*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'ms',
        marker: 'ts',
        sid: 'ts_JUD_5-6',
      },
    ]);
  });

  test('handles standalone milestone without attributes', () => {
    const input = String.raw`\ts\*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([{ type: 'ms', marker: 'ts' }]);
  });

  test('handles milestones surrounded by text', () => {
    const input = String.raw`\p this is some text \ts-s |sid="ts_JUD_5-6"\* this is some text \ts-e\*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'para',
        marker: 'p',
        content: [
          'this is some text ',
          {
            type: 'ms',
            marker: 'ts-s',
            sid: 'ts_JUD_5-6',
          },
          'this is some text ',
          {
            type: 'ms',
            marker: 'ts-e',
          },
        ],
      },
    ]);
  });

  test('handles custom milestone markers', () => {
    const input = String.raw`\zCustomMilestone-s |sid="ts_JUD_5-6"\*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'ms',
        marker: 'zCustomMilestone-s',
        sid: 'ts_JUD_5-6',
      },
    ]);
  });

  test('handles custom character markers', () => {
    const input = String.raw`\p \zword text within custom character marker\zword*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'para',
        marker: 'p',
        content: [
          {
            type: 'char',
            marker: 'zword',
            content: ['text within custom character marker'],
          },
        ],
      },
    ]);
  });

  test('handles custom character markers with attributes', () => {
    const input = String.raw`\p \zword word|x-occurrence="1"\zword*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'para',
        marker: 'p',
        content: [
          {
            type: 'char',
            marker: 'zword',
            content: ['word'],
            'x-occurrence': '1',
          },
        ],
      },
    ]);
  });

  test('handles custom paragraph markers', () => {
    const input = `\\p first paragraph\n\\zpara second paragraph`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'para',
        marker: 'p',
        content: ['first paragraph'],
      },
      {
        type: 'para',
        marker: 'zpara',
        content: ['second paragraph'],
      },
    ]);
  });

  test('logs warning for unsupported markers', () => {
    const input = String.raw`\xyz this is an unknown marker.`;
    parser.load(input).parse().getNodes();
    expect(parser.getLogs()).toContainEqual({
      type: 'warn',
      message: expect.stringContaining("Unsupported marker in USFM: '\\xyz'"),
    });
  });

  test('logs warning for text outside paragraphs', () => {
    const input = String.raw`this text is not in a paragraph`;
    parser.load(input).parse().getNodes();
    expect(parser.getLogs()).toContainEqual({
      type: 'warn',
      message: expect.stringContaining('Unexpected character outside a paragraph'),
    });
  });

  test('parses simple marker combinations', () => {
    const input = String.raw`\p this is a paragraph.
\p
\v 1 this is some text \bd that \it I want\it* to make bold\bd*\f + \fr 1.1: \ft Note text: \fq quoted text.\f* for testing. `;
    const result = JSON.parse(JSON.stringify(parser.load(input).parse().getNodes()));

    expect(result).toEqual([
      {
        type: 'para',
        marker: 'p',
        content: ['this is a paragraph.'],
      },
      {
        type: 'para',
        marker: 'p',
        content: [
          {
            type: 'verse',
            marker: 'v',
            number: '1',
          },
          'this is some text ',
          {
            type: 'char',
            marker: 'bd',
            content: [
              'that ',
              {
                type: 'char',
                marker: 'it',
                content: ['I want'],
              },
              ' to make bold',
            ],
          },
          {
            type: 'note',
            marker: 'f',
            content: [
              {
                type: 'char',
                marker: 'fr',
                content: ['1.1: '],
              },
              {
                type: 'char',
                marker: 'ft',
                content: ['Note text: '],
              },
              {
                type: 'char',
                marker: 'fq',
                content: ['quoted text.'],
              },
            ],
            caller: '+',
          },
          ' for testing. ',
        ],
      },
    ]);
  });
});
