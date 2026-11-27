const fs = require('fs');
const g = fs.readFileSync('android/gradle.properties', 'utf8')
  .replace(/versionName=([0-9.]+)/, 'versionName=1.0.3')
  .replace(/versionCode=(\d+)/, 'versionCode=4');
fs.writeFileSync('android/gradle.properties', g);
const h = fs.readFileSync('手机端原型.html', 'utf8')
  .replace(/const APP_VERSION = '[0-9.]+';/, "const APP_VERSION = '1.0.3';");
fs.writeFileSync('手机端原型.html', h);
console.log('bumped to 1.0.3');
