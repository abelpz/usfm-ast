import { USJToUSFMConverter, USJNode } from '../USJToUSFM';

describe('USJToUSFMConverter', () => {
  let converter: USJToUSFMConverter;

  beforeEach(() => {
    converter = new USJToUSFMConverter();
  });

  describe('Basic Structure', () => {
    test('converts book identification', () => {
      const usj: USJNode = {
        type: 'USJ',
        version: '3.1',
        content: [
          {
            type: 'book',
            marker: 'id',
            code: 'TIT',
            content: [],
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\id TIT');
    });

    test('converts chapter marker', () => {
      const usj: USJNode = {
        type: 'USJ',
        content: [
          {
            type: 'chapter',
            marker: 'c',
            number: '1',
            sid: 'TIT 1',
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\c 1');
    });

    test('converts verse marker', () => {
      const usj: USJNode = {
        type: 'USJ',
        content: [
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
              'Paul, a servant of God.',
            ],
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\p \\v 1 Paul, a servant of God.');
    });
  });

  describe('Character Markers', () => {
    test('converts simple character marker', () => {
      const usj: USJNode = {
        type: 'USJ',
        content: [
          {
            type: 'para',
            marker: 'p',
            content: [
              'This is ',
              {
                type: 'char',
                marker: 'em',
                content: 'emphasized',
              },
              ' text.',
            ],
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\p This is \\em emphasized\\em* text.');
    });

    test('converts character marker with attributes', () => {
      const usj: USJNode = {
        type: 'USJ',
        content: [
          {
            type: 'para',
            marker: 'p',
            content: [
              {
                type: 'char',
                marker: 'w',
                content: 'logos',
                lemma: 'word',
                'x-occurrence': '1',
              },
            ],
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\p \\w logos|lemma="word" x-occurrence="1"\\w*');
    });
  });

  describe('Note Markers', () => {
    test('converts footnote with caller', () => {
      const usj: USJNode = {
        type: 'USJ',
        content: [
          {
            type: 'para',
            marker: 'p',
            content: [
              'Text with footnote',
              {
                type: 'note',
                marker: 'f',
                caller: '+',
                content: [
                  {
                    type: 'char',
                    marker: 'ft',
                    content: 'Footnote text',
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\p Text with footnote\\f + \\ft Footnote text\\ft*\\f*');
    });

    test('converts footnote without caller', () => {
      const usj: USJNode = {
        type: 'USJ',
        content: [
          {
            type: 'para',
            marker: 'p',
            content: [
              {
                type: 'note',
                marker: 'f',
                content: ['Note content'],
              },
            ],
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\p \\f Note content\\f*');
    });
  });

  describe('Table Conversion', () => {
    test('converts simple table', () => {
      const usj: USJNode = {
        type: 'USJ',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'table:row',
                marker: 'tr',
                content: [
                  {
                    type: 'table:cell',
                    marker: 'th1',
                    align: 'start',
                    content: ['Name'],
                  },
                  {
                    type: 'table:cell',
                    marker: 'th2',
                    align: 'center',
                    content: ['Score'],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\tr \\th1 Name\\thc2 Score');
    });

    test('converts table with alignment variations', () => {
      const usj: USJNode = {
        type: 'USJ',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'table:row',
                marker: 'tr',
                content: [
                  {
                    type: 'table:cell',
                    marker: 'tc1',
                    align: 'start',
                    content: ['Left'],
                  },
                  {
                    type: 'table:cell',
                    marker: 'tc2',
                    align: 'center',
                    content: ['Center'],
                  },
                  {
                    type: 'table:cell',
                    marker: 'tc3',
                    align: 'end',
                    content: ['Right'],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\tr \\tc1 Left\\tcc2 Center\\tcr3 Right');
    });

    test('converts table with colspan', () => {
      const usj: USJNode = {
        type: 'USJ',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'table:row',
                marker: 'tr',
                content: [
                  {
                    type: 'table:cell',
                    marker: 'tcr1',
                    align: 'end',
                    colspan: '2',
                    content: ['Total:'],
                  },
                  {
                    type: 'table:cell',
                    marker: 'tcr3',
                    align: 'end',
                    content: ['186,400'],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\tr \\tcr1-2 Total:\\tcr3 186,400');
    });

    test('handles nested table cells by flattening them', () => {
      const usj: USJNode = {
        type: 'USJ',
        content: [
          {
            type: 'table',
            content: [
              {
                type: 'table:row',
                marker: 'tr',
                content: [
                  {
                    type: 'table:cell',
                    marker: 'th1',
                    align: 'start',
                    content: [
                      'Name ',
                      {
                        type: 'table:cell',
                        marker: 'thc2',
                        align: 'center',
                        content: [
                          'Score ',
                          {
                            type: 'table:cell',
                            marker: 'thr3',
                            align: 'end',
                            content: ['Rank'],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\tr \\th1 Name \\thc2 Score \\thr3 Rank');
    });
  });

  describe('Milestone Markers', () => {
    test('converts milestone marker', () => {
      const usj: USJNode = {
        type: 'USJ',
        content: [
          {
            type: 'para',
            marker: 'p',
            content: [
              'Text with ',
              {
                type: 'ms',
                marker: 'ts',
              },
              ' milestone.',
            ],
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\p Text with \\ts\\* milestone.');
    });

    test('converts milestone with attributes', () => {
      const usj: USJNode = {
        type: 'USJ',
        content: [
          {
            type: 'para',
            marker: 'p',
            content: [
              {
                type: 'ms',
                marker: 'zaln-s',
                who: 'Paul',
                'x-occurrence': '1',
              },
            ],
          },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\p \\zaln-s |who="Paul" x-occurrence="1"\\*');
    });
  });

  describe('Complex Document', () => {
    test('converts complete document with multiple elements', () => {
      const usj: USJNode = {
        type: 'USJ',
        version: '3.1',
        content: [
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
              'Paul, a ',
              {
                type: 'char',
                marker: 'em',
                content: 'servant',
              },
              ' of God.',
            ],
          },
          {
            type: 'table',
            content: [
              {
                type: 'table:row',
                marker: 'tr',
                content: [
                  {
                    type: 'table:cell',
                    marker: 'th1',
                    align: 'start',
                    content: ['Name'],
                  },
                  {
                    type: 'table:cell',
                    marker: 'thr2',
                    align: 'end',
                    content: ['Value'],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = converter.convert(usj);
      const expected = [
        '\\id TIT',
        '\\c 1',
        '\\p \\v 1 Paul, a \\em servant\\em* of God.',
        '\\tr \\th1 Name\\thr2 Value',
      ].join('\n');

      expect(result).toBe(expected);
    });
  });

  describe('Options', () => {
    test('handles line ending normalization', () => {
      const converter = new USJToUSFMConverter({ normalizeLineEndings: true });
      const usj: USJNode = {
        type: 'USJ',
        content: [
          { type: 'book', marker: 'id', code: 'TIT', content: [] },
          { type: 'chapter', marker: 'c', number: '1' },
        ],
      };

      const result = converter.convert(usj);
      expect(result).toBe('\\id TIT\n\\c 1');
      expect(result).not.toContain('\r\n');
    });
  });
});
