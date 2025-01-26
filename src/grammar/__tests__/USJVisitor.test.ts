import path from 'path';
import fs from 'fs';
import { USFMParser } from '..';
import { USJVisitor } from '../visitors/USJ';

describe('USJVisitor converts USFM to USJ correctly', () => {
  let parser: USFMParser;
  let visitor: USJVisitor;

  beforeEach(() => {
    parser = new USFMParser();
    visitor = new USJVisitor();
  });

  const readFixture = (dir: string, filename: string) => {
    return fs.readFileSync(
      path.join(__dirname, 'fixtures', dir, filename),
      'utf8'
    );
  };

  const testVisitorConversionFromFiles = (inputPath: [string, string], expectedPath: [string, string]) => async () => {
    const provided = readFixture(inputPath[0], inputPath[1]);
    const expected = readFixture(expectedPath[0], expectedPath[1]);
    testVisitorConversion({ provided, expected: JSON.parse(expected) }, { outputDocument: true });
  }

  const testVisitorConversion = ({ provided, expected }: { provided: string, expected: Record<string, any> }, { outputDocument = false }: { outputDocument?: boolean } = {}) => async () => {
    const parser = new USFMParser();
    parser.load(provided);
    const ast = parser.parse();
    const visitor = new USJVisitor();
    ast.visit(visitor);
    const actual = outputDocument ? visitor.getDocument() : visitor.getResult();

    expect(actual).toEqual(expected);
  }

  describe('Outputs correct USX structure', () => {

    test(`converts full document to usj`, testVisitorConversionFromFiles(
      ['usfm', 'tit.bsb.usfm'],
      ['usj', 'tit.bsb.json']
    ))
  });

  describe('converts markers to USJ correctly', () => {

    test(`test character attributes`, testVisitorConversion({
      provided: String.raw`\w word with attributes|x-occurrence="1"\w*`,
      expected: {
        type: 'char',
        style: 'w',
        xOccurrence: '1',
        content: 'word with attributes'
      }
    }))

    test(`test character with default attributes`, testVisitorConversion({
      provided: String.raw`\w word with attributes|logos\w*`,
      expected: {
        type: 'char',
        style: 'w',
        lemma: 'logos',
        content: 'word with attributes'
      }
    }))

    test(`simple milestone`, testVisitorConversion({
      provided: String.raw`\ts\*`,
      expected: {
        type: 'ms',
        style: 'ts',
      }
    }))

    test(`simple custom milestone`, testVisitorConversion({
      provided: String.raw`\zaln\*`,
      expected: {
        type: 'ms',
        style: 'zaln',
      }
    }))

    test(`milestone with start suffix`, testVisitorConversion({
      provided: String.raw`\zaln-s\*`,
      expected: {
        type: 'ms',
        style: 'zaln-s',
      }
    }))

    test(`milestone with attributes`, testVisitorConversion({
      provided: String.raw`\ts |sid="1"\*`,
      expected: {
        type: 'ms',
        style: 'ts',
        sid: '1',
      }
    }))

    test(`milestone with suffix and attributes`, testVisitorConversion({
      provided: String.raw`\zaln-s |who="Paul"\*`,
      expected: {
        type: 'ms',
        style: 'zaln-s',
        who: 'Paul',
      }
    }))

    test(`milestones with combined suffixes (e.g. qt1-s)`, testVisitorConversion({
      provided: String.raw`\qt1-s\*`,
      expected: {
        type: 'ms',
        style: 'qt1-s',
      }
    }))

  });

}); 