const fs = require('fs');
let g = fs.readFileSync('android/gradle.properties', 'utf8');
g = g.replace('versionName=1.0.0', 'versionName=1.0.1').replace('versionCode=1', 'versionCode=2');
fs.writeFileSync('android/gradle.properties', g);
let h = fs.readFileSync('手机端原型.html', 'utf8');
h = h.split("const APP_VERSION = '1.0.0';").join("const APP_VERSION = '1.0.1';");
fs.writeFileSync('手机端原型.html', h);
console.log('bumped to 1.0.1');
