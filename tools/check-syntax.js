const fs = require('fs');
const s = fs.readFileSync('手机端原型.html', 'utf8');
const blocks = [];
const re = /<script[^>]*>([\s\S]*?)<\/script>/g;
let m;
while ((m = re.exec(s))) if (!/\ssrc=/.test(m[0].slice(0, 40))) blocks.push(m[1]);
let bad = 0;
blocks.forEach((code, i) => {
  try { new Function(code); }
  catch (e) { bad++; console.log('block ' + i + ' 语法错误: ' + e.message); }
});
console.log('script blocks:', blocks.length, 'errors:', bad);
