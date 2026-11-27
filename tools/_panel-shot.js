/**
 * 截图首页（含学业倒计时）与倒计时编辑面板
 * 用法：electron tools/_panel-shot.js
 */
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 430, height: 880, show: true, x: 60, y: 40,
    webPreferences: { contextIsolation: false, backgroundThrottling: false },
  });
  win.focus();
  await win.loadFile(path.join(__dirname, '..', '手机端原型.html'));
  await new Promise((r) => setTimeout(r, 3200));

  // 首启会强制填资料：直接填占位值保存
  await win.webContents.executeJavaScript(`(() => {
    const sid = document.querySelector('#pfSid'), nm = document.querySelector('#pfName'), pw = document.querySelector('#pfPwd');
    if (sid) sid.value = '000000000000';
    if (nm) nm.value = '测试同学';
    if (pw) pw.value = '123456';
    const b = document.querySelector('#pfSave'); if (b) b.click();
  })()`, true);
  await new Promise((r) => setTimeout(r, 1200));

  // 关掉「制作不易」等后续弹窗
  for (let i = 0; i < 3; i++) {
    const open = await win.webContents.executeJavaScript(`document.querySelector('#mask').classList.contains('on')`, true);
    if (!open) break;
    await win.webContents.executeJavaScript(`document.querySelector('#mask').click()`, true);
    await new Promise((r) => setTimeout(r, 600));
  }

  const out = path.join(__dirname, '..', '预览图');
  fs.mkdirSync(out, { recursive: true });

  const shot1 = await win.capturePage();
  fs.writeFileSync(path.join(out, '首页倒计时.png'), shot1.toPNG());
  console.log('shot1', shot1.toPNG().length);

  await win.webContents.executeJavaScript(`document.querySelector('#cdEdit').click()`, true);
  await new Promise((r) => setTimeout(r, 900));
  const rows = await win.webContents.executeJavaScript(`!!document.querySelector('#cdRows') && document.querySelectorAll('.cd-edit').length`, true);
  console.log('editor rows', rows);
  const shot2 = await win.capturePage();
  fs.writeFileSync(path.join(out, '倒计时编辑.png'), shot2.toPNG());
  console.log('shot2', shot2.toPNG().length);

  console.log('SHOTS ' + out);
  app.quit();
});
