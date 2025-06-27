import { USFMParser } from '@usfm-tools/parser';
import { USFMVisitor } from '../src';

describe('Debug USFM Normalization', () => {
  let parser: USFMParser;
  let visitor: USFMVisitor;

  beforeEach(() => {
    parser = new USFMParser();
    visitor = new USFMVisitor();
  });

  it('should debug document start formatting', () => {
    const input = '\\id TIT\\h Titus\\c 1\\p\\v 1 Text';
    console.log('Input:', input);

    const result = parser.load(input).parse().visit(visitor);
    const output = visitor.getResult().trim();

    console.log('Full output:', JSON.stringify(output));
    console.log(
      'Output lines:',
      output.split('\n').map((line, i) => `${i}: "${line}"`)
    );

    const lines = output.split('\n');
    expect(lines.length).toBeGreaterThan(1);
  });
});
