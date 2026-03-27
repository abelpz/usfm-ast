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

  const testVisitorConversionFromFiles = (inputPath: [string, string]) => async () => {
    const provided = readFixture(inputPath[0], inputPath[1]);
    await testVisitorConversion({ provided }, { outputDocument: true })();
  };

  const testVisitorConversion =
    ({ provided }: { provided: string }, { outputDocument = false }: { outputDocument?: boolean } = {}) =>
    async () => {
      const p = new USFMParser();
      p.load(provided);
      const ast = p.parse();
      const v = new USJVisitor();
      ast.visit(v);
      const actual = outputDocument ? v.getDocument() : v.getResult();
      expect(actual).toMatchSnapshot();
    };

  describe('Outputs correct USX structure', () => {
    test(
      `converts full document to usj`,
      testVisitorConversionFromFiles(['usfm', 'tit.bsb.usfm'])
    );

    test(
      `converts jmp markers correctly`,
      testVisitorConversionFromFiles(['usfm', 'jmp.usfm'])
    );

    test(
      `converts list markers correctly`,
      testVisitorConversionFromFiles(['usfm', 'list.usfm'])
    );

    test(
      `converts list-total markers correctly`,
      testVisitorConversionFromFiles(['usfm', 'list-total.usfm'])
    );

    test(
      `converts table markers correctly`,
      testVisitorConversionFromFiles(['usfm', 'table.usfm'])
    );
  });

  describe('converts markers to USJ correctly', () => {
    test(
      `test character attributes`,
      testVisitorConversion({
        provided: String.raw`\w word with attributes|x-occurrence="1"\w*`,
        })
    );

    test(
      `test character with default attributes`,
      testVisitorConversion({
        provided: String.raw`\w word with attributes|logos\w*`,
        })
    );

    test(
      `simple milestone`,
      testVisitorConversion({
        provided: String.raw`\ts\*`,
        })
    );

    test(
      `simple custom milestone`,
      testVisitorConversion({
        provided: String.raw`\zaln\*`,
        })
    );

    test(
      `milestone with start suffix`,
      testVisitorConversion({
        provided: String.raw`\zaln-s\*`,
        })
    );

    test(
      `milestone with attributes`,
      testVisitorConversion({
        provided: String.raw`\ts |sid="1"\*`,
        })
    );

    test(
      `milestone with suffix and attributes`,
      testVisitorConversion({
        provided: String.raw`\zaln-s |who="Paul"\*`,
        })
    );

    test(
      `milestones with combined suffixes (e.g. qt1-s)`,
      testVisitorConversion({
        provided: String.raw`\qt1-s\*`,
        })
    );

    test(
      `jmp character marker with attributes`,
      testVisitorConversion({
        provided: String.raw`\jmp RSV|href="x-prj:RSV52 GEN 1:1" title="Revised Standard Version"\jmp*`,
        })
    );

    test(
      `list header paragraph marker`,
      testVisitorConversion({
        provided: String.raw`\lh This is the list of administrators:`,
        })
    );

    test(
      `list item paragraph marker`,
      testVisitorConversion({
        provided: String.raw`\li1 \lik Reuben\lik* \liv1 Eliezer son of Zichri\liv1*`,
        })
    );

    test(
      `embedded list item with total`,
      testVisitorConversion({
        provided: String.raw`\lim1 the descendants of Parosh - \litl 2,172\litl*`,
        })
    );

    test(
      `list footer paragraph marker`,
      testVisitorConversion({
        provided: String.raw`\lf This was the list of the administrators of the tribes of Israel.`,
        })
    );

    // Table marker tests
    test(
      `table header cell - left aligned`,
      testVisitorConversion({
        provided: String.raw`\tr \th1 Header`,
        })
    );

    test(
      `table header cell - center aligned`,
      testVisitorConversion({
        provided: String.raw`\tr \thc2 Centered Header`,
        })
    );

    test(
      `table header cell - right aligned`,
      testVisitorConversion({
        provided: String.raw`\tr \thr3 Right Header`,
        })
    );

    test(
      `table data cell - left aligned`,
      testVisitorConversion({
        provided: String.raw`\tr \tc1 Data`,
        })
    );

    test(
      `table data cell - center aligned`,
      testVisitorConversion({
        provided: String.raw`\tr \tcc2 Centered Data`,
        })
    );

    test(
      `table data cell - right aligned`,
      testVisitorConversion({
        provided: String.raw`\tr \tcr3 Right Data`,
        })
    );

    test(
      `table cell with colspan - header`,
      testVisitorConversion({
        provided: String.raw`\tr \th1-3 Spanning Header`,
        })
    );

    test(
      `table cell with colspan - data`,
      testVisitorConversion({
        provided: String.raw`\tr \tcr2-4 Spanning Data`,
        })
    );

    test(
      `multiple table cells in one row`,
      testVisitorConversion({
        provided: String.raw`\tr \th1 Name \thc2 Score \thr3 Rank`,
        })
    );

    test(
      `multiple table rows`,
      testVisitorConversion({
        provided: String.raw`\tr \th1 Header1 \th2 Header2
\tr \tc1 Data1 \tc2 Data2`,
        })
    );
  });
});
