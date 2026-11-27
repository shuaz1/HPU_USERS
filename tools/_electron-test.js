/**
 * 用 Electron 真跑一遍原型里的 Word 导入解析（不弹界面）
 * 用法：electron tools/_electron-test.js docx <file.docx>
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const target = process.argv[process.argv.length - 1];

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 420, height: 900, webPreferences: { contextIsolation: false } });
  await win.loadFile(path.join(__dirname, '..', '手机端原型.html'));
  const b64 = fs.readFileSync(target).toString('base64');
  const code = `
    (async () => {
      try {
        if (!window.__campusParse) return { err: '调试钩子没挂上' };
        const bytes = Uint8Array.from(atob('${b64}'), c => c.charCodeAt(0));
        const f = new File([bytes], 'test.docx');
        const res = await window.__campusParse.docx(f);
        return { n: (res.list || []).length, list: (res.list || []).slice(0, 8).map(c => '周' + c.day + ' ' + c.p1 + '-' + c.p2 + ' ' + c.n + ' ' + c.y + ' ' + c.r), empty: !!res.empty };
      } catch (e) { return { err: String(e && e.message || e) }; }
    })()`;
  const out = await win.webContents.executeJavaScript(code, true);
  console.log('RESULT ' + JSON.stringify(out, null, 1));
  app.quit();
});
