console.log('Testing table parsing...');

try {
  const { USFMParser } = require('./packages/usfm-parser/dist/parser');
  const fs = require('fs');

  const usfmPath = 'examples/usfm-markers/char-tc/tc-example-1/example.usfm';
  const usfmText = fs.readFileSync(usfmPath, 'utf8');

  console.log('USFM Input:');
  console.log(usfmText);
  console.log('\n' + '='.repeat(50) + '\n');

  const parser = new USFMParser();
  parser.parse(usfmText);

  const result = parser.toJSON();
  console.log('USJ Output:');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error('Error:', error.message);
  console.error(error.stack);
}
