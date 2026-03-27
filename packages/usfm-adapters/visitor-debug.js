const { USFMParser } = require('../usfm-parser/dist/parser/index.js');
const { USFMVisitor } = require('./src/usfm/index.ts');

const parser = new USFMParser();
const visitor = new USFMVisitor();
const input = '\\p \\w Paul\\w* went to town';

console.log('Input:', JSON.stringify(input));
console.log('Parsing...\n');

const result = parser.load(input).parse();
const nodes = result.getNodes();

console.log('Parsed nodes:');
nodes.forEach((node, i) => {
  console.log(`Node ${i}:`, {
    type: node.type,
    marker: node.marker,
    content: Array.isArray(node.content)
      ? node.content.map((c) => ({
          type: c.type,
          content: JSON.stringify(c.content),
          marker: c.marker,
        }))
      : JSON.stringify(node.content),
  });
});

console.log('\nVisiting with USFMVisitor...');
result.visit(visitor);
const output = visitor.getResult();

console.log('USFMVisitor output:', JSON.stringify(output));
console.log('USFMVisitor output (raw):', output);
