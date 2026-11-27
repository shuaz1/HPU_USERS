/**
 * 把原型 HTML 打包成安卓 assets：
 *  手机端原型.html  →  android/app/src/main/assets/index.html
 *  - 先插一段 <script src="hpu-native.js">，让 window.hpu 在页面脚本之前就存在
 *  - 有 @babel/core + preset-env 就按 chrome49 降级（async/await、解构、展开都转成老语法）
 *    没有 Babel 时退回 esbuild；两者都没有就原样拷贝（现代 WebView 照样能跑）
 *  用法：node tools/build-android-assets.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const srcHtml = path.join(root, '手机端原型.html');
const bridgeDir = path.join(root, 'android', 'bridge');
const assets = path.join(root, 'android', 'app', 'src', 'main', 'assets');

function loadBabel() {
  try { return require('@babel/core'); } catch (e) { }
  try { return require(path.join(root, 'node_modules', '@babel', 'core')); } catch (e) { }
  return null;
}
function loadPreset() {
  try { return require.resolve('@babel/preset-env'); } catch (e) { }
  try { return require.resolve(path.join(root, 'node_modules', '@babel', 'preset-env')); } catch (e) { }
  return null;
}
function loadEsbuild() {
  try { return require('esbuild'); } catch (e) { }
  try { return require(path.join(root, 'node_modules', 'esbuild')); } catch (e) { }
  return null;
}

const babel = loadBabel();
const preset = babel ? loadPreset() : null;
const esbuild = babel && preset ? null : loadEsbuild();
const mode = babel && preset ? 'babel' : (esbuild ? 'esbuild' : 'copy');

let failed = 0;

function transform(code, name) {
  if (mode === 'babel') {
    try {
      const out = babel.transformSync(code, {
        configFile: false,
        babelrc: false,
        sourceType: 'script',
        compact: false,
        presets: [[preset, { targets: { chrome: '49' }, modules: false, bugfixes: true }]]
      });
      return out && out.code ? out.code : code;
    } catch (e) {
      failed += 1;
      console.log('  ! Babel 转译失败，原样保留 ' + name + '：' + e.message.split('\n')[0]);
      return code;
    }
  }
  if (mode === 'esbuild') {
    try {
      return esbuild.transformSync(code, { target: ['chrome49'], loader: 'js', sourcefile: name }).code;
    } catch (e) {
      failed += 1;
      console.log('  ! esbuild 转译失败，原样保留 ' + name + '：' + e.message.split('\n')[0]);
      return code;
    }
  }
  return code;
}

fs.mkdirSync(assets, { recursive: true });

const bridgeFiles = ['hpu-native.js', 'grade-scraper.js', 'free-prefill.js'];
for (const f of bridgeFiles) {
  const code = fs.readFileSync(path.join(bridgeDir, f), 'utf8');
  fs.writeFileSync(path.join(assets, f), transform(code, f), 'utf8');
  console.log('bridge -> ' + f);
}

let html = fs.readFileSync(srcHtml, 'utf8');
const parts = html.split('<script>');
let rebuilt = parts[0];
// 先放桥，保证它比页面脚本更早执行
rebuilt += '<script src="hpu-native.js"></script>\n';
for (let i = 1; i < parts.length; i++) {
  const seg = parts[i];
  const end = seg.indexOf('</script>');
  const code = end >= 0 ? seg.slice(0, end) : seg;
  const rest = end >= 0 ? seg.slice(end) : '';
  rebuilt += '<script>' + transform(code, 'index.html#script' + i) + rest;
}

fs.writeFileSync(path.join(assets, 'index.html'), rebuilt, 'utf8');

const kb = (rebuilt.length / 1024).toFixed(1);
const label = { babel: 'Babel 降级到 chrome49', esbuild: 'esbuild（async 不会被降级）', copy: '原样拷贝，未降级' }[mode];
console.log('index.html -> ' + kb + ' KB（' + label + (failed ? '，' + failed + ' 段失败' : '') + '）');
if (mode === 'copy') {
  console.log('提示：想兼容 Android 5–7 的旧 WebView，先 npm i @babel/core @babel/preset-env 再重跑本脚本。');
}
