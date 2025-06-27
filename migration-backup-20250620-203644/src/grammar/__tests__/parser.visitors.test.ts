import path from "path";
import fs from "fs";
import { USFMParser } from "..";
import { USFMVisitor } from "../..";

describe("USFMParser - Visitors", () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  const readFixture = (filename: string) => {
      return fs.readFileSync(
        path.join(__dirname, 'fixtures', 'usfm', filename),
        'utf8'
      );
    };

  test('parses regular USFM file', () => {
    const input = readFixture('regular.usfm');
    const visitor = new USFMVisitor();
    parser.load(input).parse().visit(visitor);
    const text = visitor.getResult().trim();
    expect(text).toMatchSnapshot();
    //Roundtrip
    const roundtripVisitor = new USFMVisitor();
    parser.load(text).parse().visit(roundtripVisitor);
    const roundtrip = roundtripVisitor.getResult().trim();
    expect(roundtrip).toMatchSnapshot();
    expect(roundtrip).toEqual(text);
  });
}); 