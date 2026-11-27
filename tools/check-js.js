const s = require('fs').readFileSync('手机端原型.html', 'utf8');
const needles = [
  'padStart', 'padEnd', 'flatMap', '.flat(', 'Object.entries', 'Object.values', 'Object.fromEntries',
  'Promise.finally', '.finally(', 'async ', 'await ', '...S', '...p', 'matchAll', 'replaceAll',
  'IntersectionObserver', 'ResizeObserver', 'CSS.supports', 'Element.replaceChildren', 'replaceChildren',
  'navigator.clipboard', 'Intl.', 'toLocaleDateString', 'requestIdleCallback', 'structuredClone'
];
for (const n of needles) {
  const c = s.split(n).length - 1;
  if (c) console.log(n, '=', c);
}
