import path from 'path';
import fs from 'fs';
import { USFMParser } from '@usfm-tools/parser';
import { USFMVisitor } from '../src';

describe('USFMParser - Visitors', () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
  });

  const readFixture = (filename: string) => {
    return fs.readFileSync(path.join(__dirname, 'fixtures', 'usfm', filename), 'utf8');
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
    // String form can differ slightly (e.g. explicit \\fr*\\ft* placement); USJ stability is covered
    // by conversion-roundtrip and USFMVisitor.normalize round-trip tests.
    const pUsj1 = new USFMParser();
    const j1 = pUsj1.load(text).parse().toJSON();
    const pUsj2 = new USFMParser();
    const j2 = pUsj2.load(roundtrip).parse().toJSON();
    expect(JSON.stringify(j2)).toBe(JSON.stringify(j1));
  });
});
