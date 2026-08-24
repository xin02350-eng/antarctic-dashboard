import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const files = readdirSync('.').filter(f => f.endsWith('.html'));
const q = String.fromCharCode(34);
const link = '  <link rel=' + q + 'stylesheet' + q + ' href=' + q + './css/mobile.css?v=20260824g' + q + '>\n</head>';
let n = 0;
for (const f of files) {
  let s = readFileSync(f, 'utf8');
  if (s.includes('mobile.css')) continue;
  const i = s.lastIndexOf('</head>');
  if (i < 0) continue;
  s = s.slice(0, i) + link + s.slice(i + 7);
  writeFileSync(f, s);
  n++;
}
console.log('patched', n);
