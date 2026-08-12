import { readFileSync, writeFileSync } from 'node:fs';

const files = ['location.html', 'sensors.html', 'telemetry.html', 'hardware.html', 'analysis.html', 'a02.html'];

const SWITCH = '<div class="lang-switch"><span class="lang-pill" aria-hidden="true"></span><button type="button" data-lang="zh">中</button><button type="button" data-lang="en" class="active">EN</button></div>';
const FLOAT = '<div class="lang-float">' + SWITCH + '</div>';
const CSS = '<style>.lang-float{position:fixed;top:28px;right:32px;z-index:120}.header-right{margin-right:150px}@media (max-width:768px){.lang-float{top:18px;right:14px}.header-right{margin-right:0}}</style>';

for (const f of files) {
  let txt = readFileSync(f, 'utf8');
  if (txt.includes('lang-float')) { console.log('skip (already float)', f); continue; }
  const idx = txt.indexOf(SWITCH);
  if (idx < 0) { console.log('WARN switch not found in', f); continue; }
  txt = txt.slice(0, idx) + txt.slice(idx + SWITCH.length);
  const bodyMatch = txt.match(/(<body[^>]*>)/);
  if (!bodyMatch) { console.log('WARN body not found in', f); continue; }
  const bi = bodyMatch.index + bodyMatch[0].length;
  txt = txt.slice(0, bi) + FLOAT + txt.slice(bi);
  txt = txt.replace('</head>', CSS + '</head>');
  writeFileSync(f, txt);
  console.log('updated', f);
}
