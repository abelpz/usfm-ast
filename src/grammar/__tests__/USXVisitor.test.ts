import path from 'path';
import fs from 'fs';
import { USFMParser } from '..';
import { USXVisitor } from '../visitors/USX';
import { parseString } from 'xml2js';
import XmlBeautify from 'xml-beautify';
import { DOMParser } from 'xmldom';

describe('USXVisitor converts USFM to USX correctly', () => {
  let parser: USFMParser;
  let visitor: USXVisitor;

  beforeEach(() => {
    parser = new USFMParser();
    visitor = new USXVisitor();
  });

  const readFixture = (dir: string, filename: string) => {
    return fs.readFileSync(
      path.join(__dirname, 'fixtures', dir, filename),
      'utf8'
    );
  };

  const parseXMLString = (xml: string) => {
    return new Promise((resolve, reject) => parseString(xml, (err, result) => err ? reject(err) : resolve(result)));
  }


  function beautifyXml(xml: string): string {
    return new XmlBeautify({ parser: DOMParser }).beautify(xml, {
      indent: "  ",
      useSelfClosingElement: true
    });
  }

  const testVisitorConversionFromFiles = (inputPath: [string, string], expectedPath: [string, string]) => async () => {
    const provided = readFixture(inputPath[0], inputPath[1]);
    const expected = readFixture(expectedPath[0], expectedPath[1]);
    await testVisitorConversionFromStrings({ provided, expected }, { outputDocument: true, beautify: true })();
  }

  const testVisitorConversionFromStrings = ({ provided, expected }: { provided: string, expected: string }, { outputDocument = false, beautify = false }: { outputDocument?: boolean, beautify?: boolean } = {}) => async () => {
    const parser = new USFMParser();
    parser.load(provided);
    const ast = parser.parse();
    const visitor = new USXVisitor();
    ast.visit(visitor);
    const actual = outputDocument ? visitor.getDocument() : visitor.getResult();

    let beautifiedActual = beautify ? beautifyXml(actual) : actual;
    let beautifiedExpected = beautify ? beautifyXml(expected) : expected;

    
    const parsedActual = await parseXMLString(beautifiedActual);
    const parsedExpected = await parseXMLString(beautifiedExpected);
    
    expect(beautifiedActual).toEqual(beautifiedExpected);
    expect(JSON.stringify(parsedActual, null, 2)).toEqual(JSON.stringify(parsedExpected, null, 2));
  }

  describe('Outputs correct USX structure', () => {

    test(
      `converts rev.lsg.usfm to expected USX output`,
      testVisitorConversionFromFiles(
        ['usfm', 'rev.lsg.usfm'],
        ['usx', 'rev.lsg.xml']
      )
    );

    test(
      `converts structure/verses.usfm to expected USX output`, testVisitorConversionFromFiles(
        ['structure', 'verses.usfm'],
        ['structure', 'verses.xml']
      )
    );

    test(
      `converts structure/milestones.usfm to expected USX output`, testVisitorConversionFromFiles(
        ['structure', 'milestones.usfm'],
        ['structure', 'milestones.xml']
      )
    );

    test(`converts full document to xml`, testVisitorConversionFromFiles(
      ['usfm', 'tit.bsb.usfm'],
      ['usx', 'tit.bsb.xml']
    ))
  });

  describe('converts markers to USX correctly', () => {

    test(`test character attributes`, testVisitorConversionFromStrings({
      provided: String.raw`\w word with attributes|x-occurrence="1"\w*`,
      expected: String.raw`<char style="w" x-occurrence="1">word with attributes</char>`
    }))

    test(`test character with default attributes`, testVisitorConversionFromStrings({
      provided: String.raw`\w word with attributes|logos\w*`,
      expected: String.raw`<char style="w" lemma="logos">word with attributes</char>`
    }))

    test(`simple milestone`, testVisitorConversionFromStrings({
      provided: String.raw`\ts\*`,
      expected: String.raw`<ms style="ts" />`
    }))

    test(`simple custom milestone`, testVisitorConversionFromStrings({
      provided: String.raw`\zaln\*`,
      expected: String.raw`<ms style="zaln" />`
    }))

    test(`milestone with start suffix`, testVisitorConversionFromStrings({
      provided: String.raw`\zaln-s\*`,
      expected: String.raw`<ms style="zaln-s" />`
    }))

    test(`milestone with attributes`, testVisitorConversionFromStrings({
      provided: String.raw`\ts |sid="1"\*`,
      expected: String.raw`<ms style="ts" sid="1" />`
    }))

    test(`milestone with suffix and attributes`, testVisitorConversionFromStrings({
      provided: String.raw`\zaln-s |who="Paul"\*`,
      expected: String.raw`<ms style="zaln-s" who="Paul" />`
    }))

    test(`milestones with combined suffixes (e.g. qt1-s)`, testVisitorConversionFromStrings({
      provided: String.raw`\qt1-s\*`,
      expected: String.raw`<ms style="qt1-s" />`
    }))

    test(`cross-references`, testVisitorConversionFromStrings({
      provided: String.raw`\x cross-reference \x*`,
      expected: String.raw`<note caller="+" style="x">cross-reference </note>`
    }))
    
    test(`cross-reference with caller`, testVisitorConversionFromStrings({
      provided: String.raw`\x a some caller \x*`,
      expected: String.raw`<note caller="a" style="x">some caller </note>`
    }))

    test(`cross-reference with content`, testVisitorConversionFromStrings({
      provided: String.raw`\x \xo 1.1\xt cross-reference \x*`,
      expected: String.raw`<note caller="+" style="x"><char style="xo" closed="false">1.1</char><char style="xt" closed="false">cross-reference </char></note>`
    }))

    test(`footnote`, testVisitorConversionFromStrings({
      provided: String.raw`\f footnote \f*`,
      expected: String.raw`<note caller="+" style="f">footnote </note>`
    }))

    test(`footnote with caller`, testVisitorConversionFromStrings({
      provided: String.raw`\f a some caller \f*`,
      expected: String.raw`<note caller="a" style="f">some caller </note>`
    }))

    test(`footnote with content`, testVisitorConversionFromStrings({
      provided: String.raw`\f \fr 1.1\ft footnote cotent \f*`,
      expected: String.raw`<note caller="+" style="f"><char style="fr" closed="false">1.1</char><char style="ft" closed="false">footnote cotent </char></note>`
    }))

  });

}); 