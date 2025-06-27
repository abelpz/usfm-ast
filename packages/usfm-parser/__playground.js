/*Playground for quick testing*/

const { USFMParser } = require('./dist/index.js');

const usfm = String.raw`
\id TIT My translation
\c 1
\p
\v 1 My verse \v 2 my other verse
\v 3 my third verse
\p
\v 4 my fourth verse
\v 5 my fifth verse
\p
\v 6 my sixth verse
\v 7 my seventh verse
`;

const parser = new USFMParser();
const result = parser.load(usfm).parse().getNodes();
const res = JSON.parse(JSON.stringify(result));
console.log(res);
