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
        type: 'paragraph',
        marker: 'p',
        content: [{ type: 'text', content: 'this is a paragraph.' }],
      },
    ]);
    expect(parser.getLogs()).toHaveLength(0);
  });

  test('parses verse marker', () => {
    const input = String.raw`\v 1 this is a verse.`;
    const result = parser.load(input).parse().getNodes();
    expect(JSON.parse(JSON.stringify(result))).toEqual([
      {
        type: 'character',
        marker: 'v',
        content: [{ type: 'text', content: '1' }],
      },
      {
        type: 'text',
        content: 'this is a verse.',
      },
    ]);
    expect(parser.getLogs()).toHaveLength(1);
    expect(parser.getLogs()[0]).toEqual({
      type: 'warn',
      message: expect.stringContaining('Unexpected character outside a paragraph'),
    });
  });

  test('handles character inside note content', () => {
    const input = String.raw`\f + \ft this is a note with \+bd bold\+bd* text.\f*`;
    const result = JSON.parse(JSON.stringify(parser.load(input).parse().getNodes()));
    expect(result).toEqual([
      {
        type: 'note',
        marker: 'f',
        content: [
          {
            type: 'character',
            marker: 'ft',
            content: [
              {
                type: 'text',
                content: 'this is a note with ',
              },
              {
                type: 'character',
                marker: 'bd',
                content: [
                  {
                    type: 'text',
                    content: 'bold',
                  },
                ],
              },
              {
                type: 'text',
                content: ' text.',
              },
            ],
          },
        ],
        caller: '+',
      },
    ]);
  });

  test('handles character inside note', () => {
    const input = String.raw`\f + \+bd bold\+bd* text.\f*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'note',
        marker: 'f',
        content: [
          {
            type: 'character',
            marker: 'bd',
            content: [
              {
                type: 'text',
                content: 'bold',
              },
            ],
          },
          {
            type: 'text',
            content: ' text.',
          },
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
        type: 'milestone',
        marker: 'ts-s',
        milestoneType: 'start',
        attributes: { sid: 'ts_JUD_5-6' },
      },
    ]);
  });

  test('handles milestone within root without attributes', () => {
    const input = String.raw`\ts-s\*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([{ type: 'milestone', marker: 'ts-s', milestoneType: 'start' }]);
  });

  test('handles milestone within paragraph', () => {
    const input = String.raw`\p \ts-s |sid="ts_JUD_5-6"\*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'paragraph',
        marker: 'p',
        content: [
          {
            type: 'milestone',
            marker: 'ts-s',
            milestoneType: 'start',
            attributes: {
              sid: 'ts_JUD_5-6',
            },
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
        type: 'character',
        marker: 'bd',
        content: [
          {
            type: 'milestone',
            marker: 'ts-s',
            milestoneType: 'start',
            attributes: {
              sid: 'ts_JUD_5-6',
            },
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
        type: 'milestone',
        marker: 'ts',
        milestoneType: 'standalone',
        attributes: { sid: 'ts_JUD_5-6' },
      },
    ]);
  });

  test('handles standalone milestone without attributes', () => {
    const input = String.raw`\ts\*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([{ type: 'milestone', marker: 'ts', milestoneType: 'standalone' }]);
  });

  test('handles milestones surrounded by text', () => {
    const input = String.raw`\p this is some text \ts-s |sid="ts_JUD_5-6"\* this is some text \ts-e\*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'paragraph',
        marker: 'p',
        content: [
          {
            type: 'text',
            content: 'this is some text ',
          },
          {
            type: 'milestone',
            marker: 'ts-s',
            milestoneType: 'start',
            attributes: { sid: 'ts_JUD_5-6' },
          },
          {
            type: 'text',
            content: ' this is some text ',
          },
          {
            type: 'milestone',
            marker: 'ts-e',
            milestoneType: 'end',
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
        type: 'milestone',
        marker: 'zCustomMilestone-s',
        milestoneType: 'start',
        attributes: { sid: 'ts_JUD_5-6' },
      },
    ]);
  });

  test('handles custom character markers', () => {
    const input = String.raw`\p \zword text within custom character marker\zword*`;
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toEqual([
      {
        type: 'paragraph',
        marker: 'p',
        content: [
          {
            type: 'character',
            marker: 'zword',
            content: [
              {
                type: 'text',
                content: 'text within custom character marker',
              },
            ],
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
        type: 'paragraph',
        marker: 'p',
        content: [
          {
            type: 'character',
            marker: 'zword',
            content: [
              {
                type: 'text',
                content: 'word',
              },
            ],
            attributes: {
              'x-occurrence': '1',
            },
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
        type: 'paragraph',
        marker: 'p',
        content: [
          {
            type: 'text',
            content: 'first paragraph',
          },
        ],
      },
      {
        type: 'paragraph',
        marker: 'zpara',
        content: [
          {
            type: 'text',
            content: 'second paragraph',
          },
        ],
      },
    ]);
  });

  test('logs warning for unsupported markers', () => {
    const input = String.raw`\xyz this is an unknown marker.`;
    const result = parser.load(input).parse().getNodes();
    expect(parser.getLogs()).toContainEqual({
      type: 'warn',
      message: expect.stringContaining("Unsupported marker in USFM: '\\xyz'"),
    });
  });

  test('logs warning for text outside paragraphs', () => {
    const input = String.raw`this text is not in a paragraph`;
    const result = parser.load(input).parse().getNodes();
    expect(parser.getLogs()).toContainEqual({
      type: 'warn',
      message: expect.stringContaining('Unexpected character outside a paragraph'),
    });
  });

  test('parses simple marker combinations', () => {
    const input = String.raw`\p this is a paragraph.
\p
\v 1 this is some text \bd that \+it I want\+it* to make bold\bd*\f + \fr 1.1: \ft Note text: \fq quoted text.\f* for testing. `;
    const result = JSON.parse(JSON.stringify(parser.load(input).parse().getNodes()));

    expect(result).toEqual([
      {
        type: 'paragraph',
        marker: 'p',
        content: [
          {
            type: 'text',
            content: 'this is a paragraph.',
          },
        ],
      },
      {
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
            content: 'this is some text ',
          },
          {
            type: 'character',
            marker: 'bd',
            content: [
              {
                type: 'text',
                content: 'that ',
              },
              {
                type: 'character',
                marker: 'it',
                content: [
                  {
                    type: 'text',
                    content: 'I want',
                  },
                ],
              },
              {
                type: 'text',
                content: ' to make bold',
              },
            ],
          },
          {
            type: 'note',
            marker: 'f',
            content: [
              {
                type: 'character',
                marker: 'fr',
                content: [
                  {
                    type: 'text',
                    content: '1.1: ',
                  },
                ],
              },
              {
                type: 'character',
                marker: 'ft',
                content: [
                  {
                    type: 'text',
                    content: 'Note text: ',
                  },
                ],
              },
              {
                type: 'character',
                marker: 'fq',
                content: [
                  {
                    type: 'text',
                    content: 'quoted text.',
                  },
                ],
              },
            ],
            caller: '+',
          },
          {
            type: 'text',
            content: ' for testing. ',
          },
        ],
      },
    ]);
  });
});
