const { USFMParser } = require('../usfm-parser/dist/parser/index.js');

const parser = new USFMParser();
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

// Let's also see the raw content for the paragraph
if (nodes[0] && nodes[0].content) {
  console.log('\nParagraph content details:');
  nodes[0].content.forEach((contentNode, i) => {
    console.log(`  Content ${i}:`, {
      type: contentNode.type,
      content: JSON.stringify(contentNode.content),
      marker: contentNode.marker || 'N/A',
    });
  });
}
