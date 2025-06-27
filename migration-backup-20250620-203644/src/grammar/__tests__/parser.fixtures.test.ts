import { USFMParser } from "..";
import { HTMLVisitor } from "../..";
import * as fs from 'fs';
import * as path from 'path';
import { CharacterNode } from "../interfaces/USFMNodes";
import { cleanForComparison } from "./utils";

describe("USFMParser - Fixtures", () => {
  let parser: USFMParser;

  beforeEach(() => {
    parser = new USFMParser();
    parser.clearLogs();
  });

  afterEach(() => {
    parser.clearLogs();
  });

  // Helper to read fixture files
  const readFixture = (filename: string) => {
    return fs.readFileSync(
      path.join(__dirname, 'fixtures', 'usfm', filename),
      'utf8'
    );
  };

  test('parses basic USFM file', () => {
    const input = readFixture('basic.usfm');
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    
    expect(result).toMatchSnapshot();
    expect(parser.getLogs()).toHaveLength(0);
  });

  test('parses medium complexity USFM file', () => {
    const input = readFixture('medium.usfm');
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    
    expect(result).toMatchSnapshot();
    // Should have no warnings for valid USFM
    expect(parser.getLogs()).toHaveLength(0);
  });

  test('parses complex USFM file', () => {
    const input = readFixture('complex.usfm');
    const result = parser.load(input).parse().getNodes();
    
    expect(cleanForComparison(result)).toMatchSnapshot();
  });

  test('handles word attributes correctly', () => {
    const input = readFixture('basic.usfm');
    const result = parser.load(input).parse().getNodes();
    
    // Find the first word node with content
    const paragraphNode = result.find(node => 
      node.type === 'paragraph' && node.marker === 'p' && Array.isArray(node.content) && node.content.length > 0
    );
    
    expect(paragraphNode).toBeDefined();
    expect(paragraphNode?.content).toBeDefined();
    
    const wordNode = paragraphNode?.content?.[1] as CharacterNode;
    expect(wordNode).toBeDefined();
    expect(cleanForComparison(wordNode)).toMatchObject({
      type: 'character',
      marker: 'w',
      attributes: {
        'x-occurrence': '1',
        'x-occurrences': '1'
      },
      content: [
        {type: 'text', content: 'Paul'}
      ]
    });
  });

  test('handles nested markers in medium file', () => {
    const input = readFixture('medium.usfm');
    const result = parser.load(input).parse().getNodes();
    
    // Find a node with nested bold text
    const nodeWithBold = result.find(node => 
      node.type === 'paragraph' && 
      Array.isArray(node.content) &&
      node.content.some(child => 
        child.type === 'character' && child.marker === 'bd'
      )
    );
    
    expect(nodeWithBold).toBeTruthy();
    expect(cleanForComparison(nodeWithBold)).toMatchSnapshot();
  });

  test('handles poetry and lists in complex file', () => {
    const input = readFixture('complex.usfm');
    const result = parser.load(input).parse().getNodes();
    
    // Find poetry sections (q1, q2)
    const poetryNodes = result.filter(node => 
      node.type === 'paragraph' && node.marker?.startsWith('q')
    );
    
    // Find list items (li1)
    const listNodes = result.filter(node => 
      node.type === 'paragraph' && node.marker?.startsWith('li')
    );
    
    expect(poetryNodes.length).toBeGreaterThan(0);
    expect(listNodes.length).toBeGreaterThan(0);
    expect(cleanForComparison({ poetry: poetryNodes, lists: listNodes })).toMatchSnapshot();
  });

  test('parses alignment USFM file', () => {
    const input = readFixture('alignment.usfm');
    const result = cleanForComparison(parser.load(input).parse().getNodes());
    expect(result).toMatchSnapshot();
  });
});

