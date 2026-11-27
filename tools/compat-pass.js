// 兼容性处理：把 color-mix / inset / gap / backdrop-filter 换成老 WebView 也认的写法
// 用法：node tools/compat-pass.js   （会先备份 手机端原型.html.bak）
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', '手机端原型.html');
let src = fs.readFileSync(file, 'utf8');
fs.writeFileSync(file + '.bak', src, 'utf8');

const stats = { rgbVars: 0, colorMix: 0, mixLeft: 0, inset: 0, backdrop: 0, gapRules: 0 };

/* ---------- 1) 主题里补 -rgb 变量 ---------- */
const hexToRgb = (h) => {
  let v = h.replace('#', '');
  if (v.length === 3) v = v.split('').map((c) => c + c).join('');
  const n = parseInt(v, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
};
src = src.replace(/(:root\{|html\[data-theme="[a-z]+"\]\{)([\s\S]*?)\n\}/g, (whole, head, body) => {
  const injected = body.replace(/(--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;)/g, (m, decl, name, hex) => {
    if (name.endsWith('-rgb')) return m;
    stats.rgbVars += 1;
    return `${m} --${name}-rgb:${hexToRgb(hex)};`;
  });
  return head + injected + '\n}';
});

/* ---------- 2) color-mix → rgba(var(--x-rgb), a) ---------- */
src = src.replace(/color-mix\(\s*in srgb\s*,\s*var\(--([a-z0-9-]+)\)\s*([\d.]+)%\s*,\s*transparent\s*\)/g,
  (m, name, pct) => {
    stats.colorMix += 1;
    const a = (Number(pct) / 100).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
    return `rgba(var(--${name}-rgb), ${a})`;
  }
);
stats.mixLeft = (src.match(/color-mix/g) || []).length;

/* ---------- 3) inset:0 → 四边 ---------- */
src = src.replace(/inset:\s*0\s*;/g, () => { stats.inset += 1; return 'top:0;right:0;bottom:0;left:0;'; });
src = src.replace(/inset:\s*0\s*0\s*([^;]+);/g, (m, rest) => {
  stats.inset += 1;
  return `top:0;right:0;left:0;bottom:${rest.trim()};`;
});

/* ---------- 4) backdrop-filter 加 -webkit- 前缀 ---------- */
src = src.replace(/(^|[;{\s])backdrop-filter:([^;}]+)/g, (m, pre, val) => {
  stats.backdrop += 1;
  return `${pre}-webkit-backdrop-filter:${val};backdrop-filter:${val}`;
});

/* ---------- 5) flex 的 gap 兜底（老内核没有 flex gap） ---------- */
const styleStart = src.indexOf('<style>');
const styleEnd = src.indexOf('</style>');
let css = src.slice(styleStart, styleEnd);
const fallbackRules = [];
const gridGapFix = [];

for (const m of css.matchAll(/([^{}]+)\{([^{}]*gap\s*:[^{}]*)\}/g)) {
  const rawSel = m[1];
  const body = m[2];
  const sel = rawSel.replace(/\/\*[\s\S]*?\*\//g, '').trim().replace(/\s+/g, ' ');
  const gapM = body.match(/(?:^|;)\s*gap\s*:\s*([^;]+);/);
  if (!sel || !gapM) continue;
  const gapVal = gapM[1].trim();
  stats.gapRules += 1;
  const isGrid = /display\s*:\s*grid/.test(body);
  if (isGrid) {
    // 网格用旧属性 grid-gap 兜底（现代内核两者等价）
    gridGapFix.push(`${sel}{grid-gap:${gapVal}}`);
    continue;
  }
  if (!/display\s*:\s*flex/.test(body)) continue;
  const column = /flex-direction\s*:\s*column/.test(body);
  const prop = column ? 'margin-top' : 'margin-left';
  // 只给直接子元素之间加间距，不影响第一个
  fallbackRules.push(`${sel} > * + *{${prop}:${gapVal}}`);
}

if (fallbackRules.length || gridGapFix.length) {
  const block = ['\n/* ---------- 老内核兜底 ---------- */']
    .concat(gridGapFix)
    .concat(['@supports not (gap: 1px) {'])
    .concat(fallbackRules)
    .concat(['}', ''])
    .join('\n');
  src = src.slice(0, styleEnd) + block + src.slice(styleEnd);
}

/* ---------- 6) 同时保留 gap 写法 ---------- */
fs.writeFileSync(file, src, 'utf8');
console.log(JSON.stringify(stats, null, 1));
console.log('fallbackRules', fallbackRules.length, 'gridGapFix', gridGapFix.length);
