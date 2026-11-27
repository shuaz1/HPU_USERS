const fs = require('fs');
let g = fs.readFileSync('android/gradle.properties', 'utf8');
g = g.replace(/versionName=([0-9.]+)/, 'versionName=1.0.2').replace(/versionCode=(\d+)/, 'versionCode=3');
fs.writeFileSync('android/gradle.properties', g);
let h = fs.readFileSync('手机端原型.html', 'utf8');
h = h.replace(/const APP_VERSION = '[0-9.]+';/, "const APP_VERSION = '1.0.2';");
fs.writeFileSync('手机端原型.html', h);
console.log('bumped to 1.0.2');
