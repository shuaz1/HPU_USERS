const fs = require('fs');
let s = fs.readFileSync('手机端原型.html', 'utf8');
const rep = [
  ['[...g.txt.matchAll(/(\\d{1,2}:\\d{2})/g)]', 'mtAll(g.txt,/(\\d{1,2}:\\d{2})/g)'],
  ['[...label.matchAll(/(\\d{1,2}:\\d{2})/g)]', 'mtAll(label,/(\\d{1,2}:\\d{2})/g)']
];
for (const [a, b] of rep) {
  const n = s.split(a).length - 1;
  s = s.split(a).join(b);
  console.log(n, a);
}
fs.writeFileSync('手机端原型.html', s, 'utf8');
console.log('matchAll left', s.split('matchAll').length - 1, 'flat left', s.split('.flat(').length - 1);
