const fs = require('fs');
const file = '手机端原型.html';
let s = fs.readFileSync(file, 'utf8');
const pairs = [
  ['<title>理工随身册 · 手机端原型 v3</title>', '<title>理工随身册 · 河南理工大学</title>'],
  ['在桌面壳里选楼栋、楼层、房间，即可查到', '在本 App 里选楼栋、楼层、房间，即可查到'],
  ['<div class="v">壳内只读读取 · 免登录</div>', '<div class="v">只看不改 · 免登录</div>'],
  ['桌面壳会打开学校页面的真实登录窗口', 'App 会打开学校页面的真实登录窗口'],
  ["当前不是桌面壳环境，无法读取学校电费站", "当前不是原生环境，无法读取学校电费站"],
  ['网页预览抓不了教务，用桌面壳打开', '网页预览抓不了教务，用 App 打开']
];
for (const [a, b] of pairs) {
  const n = s.split(a).length - 1;
  if (n) s = s.split(a).join(b);
  console.log(n, '->', b.slice(0, 24));
}
fs.writeFileSync(file, s, 'utf8');
