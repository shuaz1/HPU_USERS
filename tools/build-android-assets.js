/**
 * 把原型 HTML 打包成安卓 assets：
 *  手机端原型.html  →  android/app/src/main/assets/index.html
 *  - 先插一段 <script src="hpu-native.js">，让 window.hpu 在页面脚本之前就存在
 *  - 有 esbuild 就按 chrome49 转译（async/await、对象展开都降级），没有就原样拷贝
 *  用法：node tools/build-android-assets.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcHtml = path.join(root, '手机端原型.html');
const bridgeDir = path.join(root, 'android', 'bridge');
const assets = path.join(root, 'android', 'app', 'src', 'main', 'assets');

let esbuild = null;
try { esbuild = require('esbuild'); } catch (e) {
  try { esbuild = require(path.join(root, 'node_modules', 'esbuild')); } catch (e2) { esbuild = null; }
}

function transpile(code, name) {
  if (!esbuild) return code;
  try {
    const out = esbuild.transformSync(code, { target: ['chrome49'], loader: 'js', sourcefile: name });
    return out.code;
  } catch (e) {
    console.log('  ! 转译失败，原样保留 ' + name + ': ' + e.message);
    return code;
  }
}

fs.mkdirSync(assets, { recursive: true });

// 1) 桥脚本
const bridgeFiles = ['hpu-native.js', 'grade-scraper.js', 'free-prefill.js'];
for (const f of bridgeFiles) {
  const code = fs.readFileSync(path.join(bridgeDir, f), 'utf8');
  fs.writeFileSync(path.join(assets, f), transpile(code, f), 'utf8');
  console.log('bridge -> ' + f);
}

// 2) 页面本体：内联脚本逐段转译，再插桥
let html = fs.readFileSync(srcHtml, 'utf8');
const parts = html.split('<script>');
let rebuilt = parts[0];
for (let i = 1; i < parts.length; i++) {
  const seg = parts[i];
  const end = seg.indexOf('</script>');
  const code = end >= 0 ? seg.slice(0, end) : seg;
  const rest = end >= 0 ? seg.slice(end) : '';
  rebuilt += '<script>' + transpile(code, 'index.html#script' + i) + rest;
}
html = rebuilt;

// 页面脚本之前先放桥
if (html.indexOf('hpu-native.js') < 0) {
  html = html.replace('<script>', '<script src="hpu-native.js"></script>\n<script>');
}

fs.writeFileSync(path.join(assets, 'index.html'), html, 'utf8');
console.log('index.html -> ' + (html.length / 1024).toFixed(1) + ' KB' + (esbuild ? '（已按 chrome49 转译）' : '（未找到 esbuild，原样拷贝）'));
