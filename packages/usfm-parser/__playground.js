/*Playground for quick testing*/

const { USFMParser } = require('./dist/index.js');

const usfm = String.raw`
\q1 \qt ...............\qt* ..............\qt ........\qt*
\q2 \qt .....\qt* ................................
\q1 ..................................................
\q2 \qt .........................................\qt*
`;

const parser = new USFMParser();
const result = parser.load(usfm).parse().getNodes();
const res = JSON.stringify(result, null, 2);
console.log(res);
