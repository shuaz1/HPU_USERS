/**
 * 版本号统一管理：改 gradle.properties 的 versionName/versionCode 与原型里的 APP_VERSION
 * 用法：node tools/bump-version.js 1.1.0 [versionCode]
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ver = (process.argv[2] || '').trim();
const codeArg = (process.argv[3] || '').trim();
if (!/^\d+\.\d+\.\d+$/.test(ver)) {
  console.error('用法：node tools/bump-version.js 1.1.0 [versionCode]');
  process.exit(1);
}

const gp = path.join(root, 'android', 'gradle.properties');
let g = fs.readFileSync(gp, 'utf8');
const cur = Number((g.match(/versionCode=(\d+)/) || [])[1] || 0);
const code = codeArg ? Number(codeArg) : cur + 1;
g = g.replace(/versionName=[0-9.]+/, 'versionName=' + ver).replace(/versionCode=\d+/, 'versionCode=' + code);
fs.writeFileSync(gp, g, 'utf8');

const hp = path.join(root, '手机端原型.html');
let h = fs.readFileSync(hp, 'utf8');
h = h.replace(/const APP_VERSION = '[0-9.]+';/, "const APP_VERSION = '" + ver + "';");
h = h.replace(/const APP_BUILD = '[^']*';/, "const APP_BUILD = '" + new Date().toISOString().slice(0, 10) + "';");
fs.writeFileSync(hp, h, 'utf8');

console.log('versionName=' + ver + ', versionCode=' + code + ', APP_VERSION=' + ver);
