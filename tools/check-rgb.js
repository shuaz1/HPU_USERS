const s = require('fs').readFileSync('手机端原型.html', 'utf8');
const used = new Set([...s.matchAll(/var\(--([a-z0-9-]+)-rgb\)/g)].map((m) => m[1]));
console.log('rgb names used:', [...used].join(', '));
const blocks = [...s.matchAll(/(:root\{|html\[data-theme="[a-z]+"\]\{)([\s\S]*?)\n\}/g)];
for (const b of blocks) {
  const head = b[1];
  const body = b[2];
  const hexNames = [...body.matchAll(/--([a-z0-9-]+)\s*:\s*#[0-9a-fA-F]{3,6}/g)]
    .map((m) => m[1])
    .filter((n) => !n.endsWith('-rgb'));
  const rgbNames = new Set([...body.matchAll(/--([a-z0-9-]+)-rgb\s*:/g)].map((m) => m[1]));
  const missing = hexNames.filter((n) => used.has(n) && !rgbNames.has(n));
  console.log(head, 'hex', hexNames.length, 'missingRgb:', missing.join(',') || 'none');
}
