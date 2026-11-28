/**
 * 生成 GitHub 展示用的界面截图（用示例课表，不含任何真实个人信息）
 * 用法：electron tools/_guide-shot.js
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, '..', 'docs', 'images');

// 示例课表：课程名、教师、教室全部为占位内容
const DEMO = [
  { n: '高等数学 A(2)', y: '示例教师', r: '南校区 1 号教学楼 101', day: 1, p1: 1, p2: 2, t: '08:00', e: '09:40', wrs: [[1, 16]], wt: 'all' },
  { n: '大学英语 III', y: '示例教师', r: '南校区 1 号教学楼 203', day: 1, p1: 3, p2: 4, t: '10:00', e: '11:40', wrs: [[1, 16]], wt: 'all' },
  { n: '数据结构', y: '示例教师', r: '计算机综合楼 301', day: 2, p1: 1, p2: 2, t: '08:00', e: '09:40', wrs: [[1, 16]], wt: 'all' },
  { n: '计算机组成原理', y: '示例教师', r: '南校区 1 号教学楼 405', day: 3, p1: 7, p2: 8, t: '15:25', e: '17:15', wrs: [[1, 12]], wt: 'all' },
  { n: '操作系统', y: '示例教师', r: '计算机综合楼 305', day: 4, p1: 3, p2: 4, t: '10:00', e: '11:40', wrs: [[2, 16]], wt: 'all' },
  { n: '体育（篮球）', y: '示例教师', r: '南校区 田径场', day: 5, p1: 5, p2: 6, t: '11:50', e: '15:15', wrs: [[3, 14]], wt: 'all' },
  { n: '创新创业实践', y: '示例教师', r: '大学生活动中心 204', day: 6, p1: 3, p2: 4, t: '10:00', e: '11:40', wrs: [[3, 14]], wt: 'all' },
  { n: '工程训练（金工实习）', y: '示例教师', r: '工程训练中心 2 号车间', day: 6, p1: 7, p2: 8, t: '15:25', e: '17:15', wrs: [[5, 15]], wt: 'all' },
];

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 390, height: 844, show: true, x: 40, y: 20,
    webPreferences: { contextIsolation: false, backgroundThrottling: false },
  });
  win.focus();
  await win.loadFile(path.join(__dirname, '..', '手机端原型.html'));
  await new Promise((r) => setTimeout(r, 2600));

  const js = (code) => win.webContents.executeJavaScript(code, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  // 清掉上一次调试残留的数据，从首启状态开始
  await js(`localStorage.clear()`);
  await win.webContents.reload();
  await wait(2600);

  // 隐藏滚动条，截图更干净
  await js(`(() => {
    const s = document.createElement('style');
    s.textContent = '::-webkit-scrollbar{width:0;height:0}';
    document.head.appendChild(s);
  })()`);

  // 填占位资料，避免首启强制弹窗
  await js(`(() => {
    const sid = document.querySelector('#pfSid'), nm = document.querySelector('#pfName'), pw = document.querySelector('#pfPwd');
    if (sid) sid.value = '000000000000';
    if (nm) nm.value = '示例同学';
    if (pw) pw.value = '123456';
    const b = document.querySelector('#pfSave'); if (b) b.click();
  })()`);
  await wait(1000);

  // 关掉后续弹窗
  for (let i = 0; i < 4; i++) {
    const open = await js(`document.querySelector('#mask').classList.contains('on')`);
    if (!open) break;
    await js(`document.querySelector('#mask').click()`);
    await wait(600);
  }

  // 写入示例课表
  await js(`window.__campusParse.apply(${JSON.stringify(DEMO)})`);
  await wait(2800);
  await js(`(() => { const m = document.querySelector('#mask'); if (m) m.click(); })()`);
  await wait(600);

  fs.mkdirSync(OUT, { recursive: true });

  const shot = async (name) => {
    await js(`(() => { document.querySelectorAll('.screens, .screen, body, html').forEach(e => { if (e) e.scrollTop = 0; }); window.scrollTo(0, 0); })()`);
    await wait(800);
    const img = await win.capturePage();
    fs.writeFileSync(path.join(OUT, name), img.toPNG());
    console.log('shoot', name, img.toPNG().length);
  };

  const tab = async (t) => {
    await js(`document.querySelector('.tab[data-tab="${t}"]').click()`);
    await wait(900);
  };

  await tab('home');
  await shot('01-home.png');

  await tab('timetable');
  await shot('02-timetable.png');

  // 日列表视图
  await js(`(() => { const b = [...document.querySelectorAll('#timetableMode button, #s-timetable button')].find(x => /日列表/.test(x.textContent)); if (b) b.click(); })()`);
  await wait(900);
  await shot('03-daylist.png');
  await js(`(() => { const b = [...document.querySelectorAll('#s-timetable button')].find(x => /周网格/.test(x.textContent)); if (b) b.click(); })()`);
  await wait(700);

  // 导入面板
  await js(`document.querySelector('#importCourse').click()`);
  await wait(1100);
  await shot('04-import.png');

  // 面板里的教务登录界面
  await js(`document.querySelector('#inAppLogin').click()`);
  await wait(1200);
  await shot('05-login.png');
  for (let i = 0; i < 3; i++) {
    const open = await js(`(() => { const l = document.querySelector('#loginLayer'); if (!l) return false; const cs = getComputedStyle(l); return cs.display !== 'none' && cs.visibility !== 'hidden'; })()`);
    if (!open) break;
    await js(`document.querySelector('#loginBack').click()`);
    await wait(500);
  }
  await js(`(() => { const m = document.querySelector('#mask'); if (m && m.classList.contains('on')) m.click(); })()`);
  await wait(600);
  await js(`(() => { const m = document.querySelector('#mask'); if (m && m.classList.contains('on')) m.click(); })()`);
  await wait(600);

  // 学业倒计时编辑
  await js(`document.querySelector('#cdEdit').click()`);
  await wait(1000);
  await shot('06-countdown.png');
  await js(`(() => { const m = document.querySelector('#mask'); if (m) m.click(); })()`);
  await wait(600);

  await tab('library');
  await shot('07-library.png');

  await tab('campus');
  await shot('08-campus.png');

  // 校园页下半部分：版本 / 使用说明 / 导出
  await js(`(() => { ['#s-campus', '.screen.on'].forEach(sel => { const el = document.querySelector(sel); if (el) el.scrollTop = el.scrollHeight; }); })()`);
  await wait(900);
  const img2 = await win.capturePage();
  fs.writeFileSync(path.join(OUT, '09-campus-more.png'), img2.toPNG());
  console.log('shoot 09-campus-more.png', img2.toPNG().length);

  // 首启署名
  await js(`(() => { document.querySelectorAll('.screens, .screen').forEach(e => { if (e) e.scrollTop = 0; }); })()`);
  await js(`document.querySelector('#openThanks').click()`);
  await wait(1000);
  await shot('10-thanks.png');

  console.log('DONE ' + OUT);
  app.quit();
});
