import path from 'path';
import fs from 'fs';
import { USFMParser } from '..';
import { USXVisitor } from '../visitors/USXVisitor';
import { parseString } from 'xml2js';
import XmlBeautify from 'xml-beautify';
import { DOMParser } from 'xmldom';

describe('USXVisitor', () => {
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
    testVisitorConversionFromStrings({provided, expected}, {outputDocument: true, beautify: true});
  }

  const testVisitorConversionFromStrings = ({provided, expected}: {provided: string, expected: string}, {outputDocument = false, beautify = false}: {outputDocument?: boolean, beautify?: boolean} = {}) => async () => {
    const parser = new USFMParser();
    parser.load(provided);
    const ast = parser.parse();
    const visitor = new USXVisitor();
    ast.visit(visitor);
    const actual = outputDocument ? visitor.getDocument() : visitor.getResult();

    let beautifiedActual = beautify ? beautifyXml(actual) : actual;
    let beautifiedExpected = beautify ? beautifyXml(expected) : expected;

    expect(beautifiedActual).toEqual(beautifiedExpected);
    
    const parsedActual = await parseXMLString(beautifiedActual);
    const parsedExpected = await parseXMLString(beautifiedExpected);
    
    expect(parsedActual).toEqual(parsedExpected);
  }

  test(`converts rev.lsg.usfm to expected USX output`, testVisitorConversionFromFiles(['usfm','rev.lsg.usfm'], ['usx','rev.lsg.xml']));

  test(`converts structure/verses.usfm to expected USX output`, testVisitorConversionFromFiles(['structure','verses.usfm'], ['structure','verses.xml']));
  
  test(`converts structure/milestones.usfm to expected USX output`, testVisitorConversionFromFiles(['structure', 'milestones.usfm'], ['structure', 'milestones.xml']));
  
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

  test(`milestone with suffix`, testVisitorConversionFromStrings({
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



}); 