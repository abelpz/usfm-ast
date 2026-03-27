import path from 'path';
import fs from 'fs';
import { USFMParser } from '@usfm-tools/parser';
import { USJVisitor } from '../src';

describe('USJ Visitor converts USFM to USJ correctly', () => {
  let parser: USFMParser;
  let visitor: USJVisitor;

  beforeEach(() => {
    parser = new USFMParser();
    visitor = new USJVisitor();
  });

  const readFixture = (dir: string, filename: string) => {
    return fs.readFileSync(path.join(__dirname, 'fixtures', dir, filename), 'utf8');
  };

  const testVisitorConversionFromFiles =
    (inputPath: [string, string], expectedPath: [string, string]) => async () => {
      const provided = readFixture(inputPath[0], inputPath[1]);
      const expected = readFixture(expectedPath[0], expectedPath[1]);
      testVisitorConversion({ provided, expected: JSON.parse(expected) }, { outputDocument: true });
    };

  const testVisitorConversion =
    (
      { provided, expected }: { provided: string; expected: Record<string, any> },
      { outputDocument = false }: { outputDocument?: boolean } = {}
    ) =>
    async () => {
      const parser = new USFMParser();
      parser.load(provided);
      const ast = parser.parse();
      const visitor = new USJVisitor();
      ast.visit(visitor);
      const actual = outputDocument ? visitor.getDocument() : visitor.getResult();

      expect(actual).toEqual(expected);
    };

  describe('Outputs correct USX structure', () => {
    test(
      `converts full document to usj`,
      testVisitorConversionFromFiles(['usfm', 'tit.bsb.usfm'], ['usj', 'tit.bsb.json'])
    );

    test(
      `converts jmp markers correctly`,
      testVisitorConversionFromFiles(['usfm', 'jmp.usfm'], ['usj', 'jmp.json'])
    );

    test(
      `converts list markers correctly`,
      testVisitorConversionFromFiles(['usfm', 'list.usfm'], ['usj', 'list.json'])
    );

    test(
      `converts list-total markers correctly`,
      testVisitorConversionFromFiles(['usfm', 'list-total.usfm'], ['usj', 'list-total.json'])
    );

    test(
      `converts table markers correctly`,
      testVisitorConversionFromFiles(['usfm', 'table.usfm'], ['usj', 'table.json'])
    );
  });

  describe('converts markers to USJ correctly', () => {
    test(
      `test character attributes`,
      testVisitorConversion({
        provided: String.raw`\w word with attributes|x-occurrence="1"\w*`,
        expected: {
          type: 'char',
          marker: 'w',
          'x-occurrence': '1',
          content: 'word with attributes',
        },
      })
    );

    test(
      `test character with default attributes`,
      testVisitorConversion({
        provided: String.raw`\w word with attributes|logos\w*`,
        expected: {
          type: 'char',
          marker: 'w',
          lemma: 'logos',
          content: 'word with attributes',
        },
      })
    );

    test(
      `simple milestone`,
      testVisitorConversion({
        provided: String.raw`\ts\*`,
        expected: {
          type: 'ms',
          marker: 'ts',
        },
      })
    );

    test(
      `simple custom milestone`,
      testVisitorConversion({
        provided: String.raw`\zaln\*`,
        expected: {
          type: 'ms',
          marker: 'zaln',
        },
      })
    );

    test(
      `milestone with start suffix`,
      testVisitorConversion({
        provided: String.raw`\zaln-s\*`,
        expected: {
          type: 'ms',
          marker: 'zaln-s',
        },
      })
    );

    test(
      `milestone with attributes`,
      testVisitorConversion({
        provided: String.raw`\ts |sid="1"\*`,
        expected: {
          type: 'ms',
          marker: 'ts',
          sid: '1',
        },
      })
    );

    test(
      `milestone with suffix and attributes`,
      testVisitorConversion({
        provided: String.raw`\zaln-s |who="Paul"\*`,
        expected: {
          type: 'ms',
          marker: 'zaln-s',
          who: 'Paul',
        },
      })
    );

    test(
      `milestones with combined suffixes (e.g. qt1-s)`,
      testVisitorConversion({
        provided: String.raw`\qt1-s\*`,
        expected: {
          type: 'ms',
          marker: 'qt1-s',
        },
      })
    );

    test(
      `jmp character marker with attributes`,
      testVisitorConversion({
        provided: String.raw`\jmp RSV|href="x-prj:RSV52 GEN 1:1" title="Revised Standard Version"\jmp*`,
        expected: {
          type: 'char',
          marker: 'jmp',
          href: 'x-prj:RSV52 GEN 1:1',
          title: 'Revised Standard Version',
          content: 'RSV',
        },
      })
    );

    test(
      `list header paragraph marker`,
      testVisitorConversion({
        provided: String.raw`\lh This is the list of administrators:`,
        expected: {
          type: 'para',
          marker: 'lh',
          content: ['This is the list of administrators:'],
        },
      })
    );

    test(
      `list item paragraph marker`,
      testVisitorConversion({
        provided: String.raw`\li1 \lik Reuben\lik* \liv1 Eliezer son of Zichri\liv1*`,
        expected: {
          type: 'para',
          marker: 'li1',
          content: [
            {
              type: 'char',
              marker: 'lik',
              content: 'Reuben',
            },
            ' ',
            {
              type: 'char',
              marker: 'liv1',
              content: 'Eliezer son of Zichri',
            },
          ],
        },
      })
    );

    test(
      `embedded list item with total`,
      testVisitorConversion({
        provided: String.raw`\lim1 the descendants of Parosh - \litl 2,172\litl*`,
        expected: {
          type: 'para',
          marker: 'lim1',
          content: [
            'the descendants of Parosh - ',
            {
              type: 'char',
              marker: 'litl',
              content: '2,172',
            },
          ],
        },
      })
    );

    test(
      `list footer paragraph marker`,
      testVisitorConversion({
        provided: String.raw`\lf This was the list of the administrators of the tribes of Israel.`,
        expected: {
          type: 'para',
          marker: 'lf',
          content: ['This was the list of the administrators of the tribes of Israel.'],
        },
      })
    );

    // Table marker tests
    test(
      `table header cell - left aligned`,
      testVisitorConversion({
        provided: String.raw`\tr \th1 Header`,
        expected: {
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
                  content: ['Header'],
                },
              ],
            },
          ],
        },
      })
    );

    test(
      `table header cell - center aligned`,
      testVisitorConversion({
        provided: String.raw`\tr \thc2 Centered Header`,
        expected: {
          type: 'table',
          content: [
            {
              type: 'table:row',
              marker: 'tr',
              content: [
                {
                  type: 'table:cell',
                  marker: 'thc2',
                  align: 'center',
                  content: ['Centered Header'],
                },
              ],
            },
          ],
        },
      })
    );

    test(
      `table header cell - right aligned`,
      testVisitorConversion({
        provided: String.raw`\tr \thr3 Right Header`,
        expected: {
          type: 'table',
          content: [
            {
              type: 'table:row',
              marker: 'tr',
              content: [
                {
                  type: 'table:cell',
                  marker: 'thr3',
                  align: 'end',
                  content: ['Right Header'],
                },
              ],
            },
          ],
        },
      })
    );

    test(
      `table data cell - left aligned`,
      testVisitorConversion({
        provided: String.raw`\tr \tc1 Data`,
        expected: {
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
                  content: ['Data'],
                },
              ],
            },
          ],
        },
      })
    );

    test(
      `table data cell - center aligned`,
      testVisitorConversion({
        provided: String.raw`\tr \tcc2 Centered Data`,
        expected: {
          type: 'table',
          content: [
            {
              type: 'table:row',
              marker: 'tr',
              content: [
                {
                  type: 'table:cell',
                  marker: 'tcc2',
                  align: 'center',
                  content: ['Centered Data'],
                },
              ],
            },
          ],
        },
      })
    );

    test(
      `table data cell - right aligned`,
      testVisitorConversion({
        provided: String.raw`\tr \tcr3 Right Data`,
        expected: {
          type: 'table',
          content: [
            {
              type: 'table:row',
              marker: 'tr',
              content: [
                {
                  type: 'table:cell',
                  marker: 'tcr3',
                  align: 'end',
                  content: ['Right Data'],
                },
              ],
            },
          ],
        },
      })
    );

    test(
      `table cell with colspan - header`,
      testVisitorConversion({
        provided: String.raw`\tr \th1-3 Spanning Header`,
        expected: {
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
                  colspan: '3',
                  content: ['Spanning Header'],
                },
              ],
            },
          ],
        },
      })
    );

    test(
      `table cell with colspan - data`,
      testVisitorConversion({
        provided: String.raw`\tr \tcr2-4 Spanning Data`,
        expected: {
          type: 'table',
          content: [
            {
              type: 'table:row',
              marker: 'tr',
              content: [
                {
                  type: 'table:cell',
                  marker: 'tcr2',
                  align: 'end',
                  colspan: '3',
                  content: ['Spanning Data'],
                },
              ],
            },
          ],
        },
      })
    );

    test(
      `multiple table cells in one row`,
      testVisitorConversion({
        provided: String.raw`\tr \th1 Name \thc2 Score \thr3 Rank`,
        expected: {
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
                  content: ['Name '],
                },
                {
                  type: 'table:cell',
                  marker: 'thc2',
                  align: 'center',
                  content: ['Score '],
                },
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
      })
    );

    test(
      `multiple table rows`,
      testVisitorConversion({
        provided: String.raw`\tr \th1 Header1 \th2 Header2
\tr \tc1 Data1 \tc2 Data2`,
        expected: {
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
                  content: ['Header1 '],
                },
                {
                  type: 'table:cell',
                  marker: 'th2',
                  align: 'start',
                  content: ['Header2'],
                },
              ],
            },
            {
              type: 'table:row',
              marker: 'tr',
              content: [
                {
                  type: 'table:cell',
                  marker: 'tc1',
                  align: 'start',
                  content: ['Data1 '],
                },
                {
                  type: 'table:cell',
                  marker: 'tc2',
                  align: 'start',
                  content: ['Data2'],
                },
              ],
            },
          ],
        },
      })
    );
  });
});
