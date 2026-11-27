/**
 * 离线验证课表解析：从 手机端原型.html 里抠出相关函数，在 Node 里跑
 * 用法：
 *   node tools/_test-import.js docx <document.xml>
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, '手机端原型.html'), 'utf8');
const lines = html.split('\n');

function grab(startPattern) {
  const i = lines.findIndex(l => l.trim().startsWith(startPattern));
  if (i < 0) throw new Error('not found: ' + startPattern);
  let j = i + 1;
  for (; j < lines.length; j++) {
    if (/^  \}\s*$/.test(lines[j])) { j++; break; }
  }
  return lines.slice(i, j).join('\n');
}
function grabConst(startPattern) {
  const i = lines.findIndex(l => l.trim().startsWith(startPattern));
  if (i < 0) throw new Error('not found: ' + startPattern);
  if (lines[i].trim().endsWith('{')) {
    let j = i + 1;
    for (; j < lines.length; j++) if (/^\s*\}\s*;?\s*$/.test(lines[j])) { j++; break; }
    return lines.slice(i, j).join('\n');
  }
  return lines[i];
}

const src = [
  grabConst('const PTS = {'),
  grabConst('let PT = '),
  grabConst('const DAY_MAP = '),
  grabConst('const CN_NUM = '),
  grab('function parseWrs('),
  grab('function cellCourses('),
  grab('function periodOfTime('),
  grab('function xmlText('),
  grab('function tidyCell('),
  grab('function docxRows('),
  grab('function docxCourses('),
].join('\n\n');

const sandbox = {};
const fn = new Function('exports', src + '\nexports.docxCourses=docxCourses; exports.cellCourses=cellCourses;');
fn(sandbox);

const mode = process.argv[2];
const file = process.argv[3];

(async () => {
  if (mode === 'docx') {
    const xml = fs.readFileSync(file, 'utf8');
    const list = sandbox.docxCourses(xml);
    console.log('docx courses:', list.length);
    list.slice(0, 12).forEach(c => console.log(`  周${c.day} 第${c.p1}-${c.p2}节 ${c.n} | ${c.y} | ${c.r} | 周次 ${JSON.stringify(c.wrs)}`));
    return;
  }
  console.error('仅支持 docx 模式：node tools/_test-import.js docx <document.xml>');
  process.exit(1);
})().catch(e => { console.error('ERR', e && e.message); process.exit(1); });
