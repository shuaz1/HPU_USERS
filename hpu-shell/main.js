const { app, BrowserWindow, ipcMain, session, shell, dialog, net } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

// 数据目录写到本机可写位置（默认 %APPDATA%，受限环境下会报 cache 拒绝访问）
try {
  app.setPath('userData', path.join(os.homedir(), '.hpu-campus-shell'));
} catch (e) { /* 忽略 */ }

const PROTO = path.join(__dirname, '..', '手机端原型.html');
const PARTITION = 'persist:hpu-session';           // 登录态落盘，重启仍在
const SMOKE = process.argv.includes('--smoke');    // 无界面自检模式

// 教务「从平台登录」实际走这条统一认证链（用户实测提供）：
// cas/login?service=<uia sso/login?redirect_uri=<zhjw eams/login.action>&x_client=cas>#/
const CAS_LOGIN =
  'https://uia.hpu.edu.cn/cas/login?service=https%3A%2F%2Fuia.hpu.edu.cn%2Fsso%2Flogin%3Fredirect_uri%3D' +
  'https%253A%252F%252Fzhjw.hpu.edu.cn%252Feams%252Flogin.action%26x_client%3Dcas#/';
const HOME_URL = 'https://zhjw.hpu.edu.cn/eams/homeExt.action';   // 教务系统首页（个人工作台）
// 课表页必须带 method 段：courseTableForStd!courseTable.action
// 只写 courseTableForStd.action 会抛 OGNL MethodFailedException（实测已踩）
const TABLE_URL = 'https://zhjw.hpu.edu.cn/eams/courseTableForStd!courseTable.action';
const TABLE_URL_ALT = 'https://zhjw.hpu.edu.cn/eams/courseTableForStd!courseTable.action?setting.kind=std&ignoreHead=1';
const TABLE_INDEX = 'https://zhjw.hpu.edu.cn/eams/courseTableForStd!index.action';   // 课表查询页（带学期下拉）

// 索引页里点“查询/检索”，并读学期下拉
const CLICK_QUERY = `(() => {
  const els = Array.from(document.querySelectorAll('input,button,a'));
  const hit = els.find(e => /查询|检索|搜索|显示/.test((e.value || '') + (e.textContent || '')) && !e.disabled);
  if (hit) { hit.click(); return 'clicked'; }
  const sel = Array.from(document.querySelectorAll('select')).find(s => /semester|term|学期/i.test((s.name||'') + (s.id||'') + ' ' + (s.getAttribute('onchange')||'')));
  if (sel) { const o = sel.options[sel.selectedIndex]; return 'semester=' + (o ? o.value : ''); }
  return 'none';
})()`;

// 在教务首页里找“我的课表”入口：先扫 a/form 的 href，再扫整页源码里的 courseTableForStd 片段，最后取学期 id
const FIND_TABLE = `(() => {
  const fromEls = (s) => Array.from(document.querySelectorAll(s))
    .map(el => el.getAttribute('href') || el.getAttribute('action') || '')
    .filter(u => /courseTableForStd/i.test(u));
  let hit = fromEls('a')[0] || fromEls('form')[0] || '';
  if (!hit) {
    const src = document.documentElement.innerHTML;
    const m = src.match(/[/a-zA-Z0-9_.!?&=%-]*courseTableForStd[A-Za-z0-9_.!?&=%-]*/);
    if (m) hit = m[0];
  }
  let sid = '';
  const sel = document.querySelector('select[name*="semester" i], select[id*="semester" i], select[name*="term" i]');
  if (sel) {
    const o = sel.querySelector('option[selected]') || sel.options[sel.selectedIndex];
    sid = (o && o.value) || '';
  }
  if (!sid) {
    const all = document.documentElement.innerHTML;
    const m = all.match(/semester[Ii]d=(\\d+)/);
    if (m) sid = m[1];
  }
  return { href: hit, semesterId: sid };
})()`;

// 在课表页执行的抓取脚本：优先返回含“星期X/节次/周次”的表，没有就退回整页 body
const EXTRACT = `(() => {
  const tables = Array.from(document.querySelectorAll('table'));
  const good = tables.filter(t =>
    /(?:星期|周)[一二三四五六日天]/.test(t.textContent) && /节次|周次/.test(t.textContent)
  );
  const pick = good.length ? good : tables.filter(t => t.rows && t.rows.length > 5);
  const html = pick.length
    ? pick.map(t => t.outerHTML).join('\\n')
    : document.body.innerHTML;
  return { title: document.title, url: location.href, html, tables: pick.length, bytes: html.length };
})()`;

let mainWin = null;
let childWin = null;

function sharedSession() {
  const s = session.fromPartition(PARTITION);
  // 教务系统会校验 UA（页面写明只支持谷歌/360极速），Electron 默认 UA 带 Electron 标记会被挡
  try {
    s.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');
  } catch (e) { /* 忽略 */ }
  // 学校微后勤等站点证书已过期（ERR_CERT_DATE_INVALID -201），壳内只对这些校内/关联域名放行
  try {
    s.setCertificateVerifyProc((req, cb) => {
      const host = (req && req.hostname) || '';
      if (/hpu\.edu\.cn|cyanstone\.top|weixin\.qq\.com|183\.169\.255\.4/i.test(host)) return cb(0);
      cb(-3);
    });
  } catch (e) { /* 忽略 */ }
  return s;
}

/* 导航日志：排查看“一直跳回登录页”到底走过了哪些地址 */
function navLog(tag, extra) {
  try {
    const dir = path.join(__dirname, 'debug');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, 'nav.log'), `[${new Date().toISOString()}] ${tag} ${extra || ''}\n`, 'utf8');
  } catch (e) { /* 忽略 */ }
}

function harden(contents) {
  // 只读查询：不弹新窗口、不下载，外链交给系统浏览器
  contents.setWindowOpenHandler(({ url }) => {
    if (/hpu\.edu\.cn|cyanstone\.top|weixin\.qq\.com|183\.169\.255\.4/i.test(url)) return { action: 'allow', overrideBrowserWindowOptions: {} };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (!/hpu\.edu\.cn|cyanstone\.top|weixin\.qq\.com|183\.169\.255\.4|about:blank/i.test(url)) {
      e.preventDefault();
      shell.openExternal(url);
    }
  });
}

function createMain() {
  mainWin = new BrowserWindow({
    width: 430,
    height: 900,
    minWidth: 360,
    minHeight: 640,
    title: '校园助手 · 河南理工大学',
    backgroundColor: '#061019',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (!fs.existsSync(PROTO)) {
    dialog.showErrorBox('找不到原型文件', PROTO);
  }
  mainWin.loadFile(PROTO);
  mainWin.on('closed', () => { mainWin = null; });
}

/** 在共享会话里开一个子窗口，返回结束时窗口对象 */
const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// 这两个站是按 UA / 窄屏布局的 H5：子窗口给手机 UA + 竖屏尺寸，只浏览登录，不跑抓取
const MOBILE_HOST_RE = /seatlib\.hpu\.edu\.cn|uia\.hpu\.edu\.cn/i;
// 教务（zhjw）是桌面版页面：表格宽，窄窗口会挤成一条，给桌面 UA + 加宽窗口
const DESKTOP_HOST_RE = /zhjw\.hpu\.edu\.cn/i;

function openChild(url, title, opts = {}) {
  if (childWin && !childWin.isDestroyed()) childWin.close();
  childWin = new BrowserWindow({
    width: opts.width || 430,
    height: opts.height || 860,
    parent: mainWin || undefined,
    title: title || '校内页面',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (opts.ua) childWin.webContents.setUserAgent(opts.ua);
  harden(childWin.webContents);
  childWin.loadURL(url);
  const w = childWin;
  w.on('closed', () => { if (childWin === w) childWin = null; });
  return w;
}

/* ---------------- 登录 + 抓课表 ---------------- */
ipcMain.handle('hpu:login', () => new Promise((resolve) => {
  const win = new BrowserWindow({
    width: 980,
    height: 920,
    minWidth: 420,
    minHeight: 640,
    parent: mainWin || undefined,
    title: '统一身份认证 · 登录',
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  harden(win.webContents);

  let settled = false;
  let wentHome = false;
  let triedTable = false;
  let triedAlt = false;
  let triedIndex = false;
  let triedClick = false;
  let extractStarted = false;
  let timer = null;
  let snapCache = { html: '', url: '', at: 0 };

  const setHint = (t) => { if (!win.isDestroyed()) win.setTitle(t); };

  const finish = (payload) => {
    if (settled) return;
    settled = true;
    if (timer) clearInterval(timer);
    if (!win.isDestroyed()) win.close();
    resolve(payload);
  };

  // 页面一加载完就先抓一份快照：这样即使课表是异步渲染、或用户先关了窗口，也有真实 DOM 可用
  const snap = async () => {
    if (win.isDestroyed()) return;
    try {
      const r = await win.webContents.executeJavaScript(EXTRACT, true);
      if (r && r.html) snapCache = { html: r.html, url: r.url || win.webContents.getURL(), at: Date.now() };
    } catch (e) { navLog('snap-err', String((e && e.message) || e)); }
  };
  win.webContents.on('did-finish-load', () => {
    const u = win.webContents.getURL();
    if (/zhjw\.hpu\.edu\.cn|uia\.hpu\.edu\.cn/.test(u)) setTimeout(snap, 700);
  });

  // 用户手动关闭窗口：把已抓到的快照当成结果交回去，不要白跑一趟
  win.on('close', () => {
    if (settled) return;
    if (snapCache.html && /(?:星期|周)[一二三四五六日天]/.test(snapCache.html)) {
      settled = true;
      if (timer) clearInterval(timer);
      dumpDebug('ok', snapCache.html);
      navLog('extract-ok-by-close', `bytes=${snapCache.html.length} url=${snapCache.url}`);
      resolve({ ok: true, html: snapCache.html, url: snapCache.url, title: '课表（窗口关闭前）', tables: 0 });
    }
  });

  async function extract() {
    if (extractStarted) return;
    extractStarted = true;
    setHint('正在抓取课表…');
    navLog('extract-start', win.webContents.getURL());
    await new Promise((r) => setTimeout(r, 1800));   // 等页面把课表渲染完
    try {
      let r = null;
      let lastErr = '';
      // 课表可能是异步画出来的：最多试 3 轮，每轮间隔 900ms
      for (let i = 0; i < 3; i++){
        try {
          r = await win.webContents.executeJavaScript(EXTRACT, true);
        } catch (e) {
          lastErr = String((e && e.message) || e);
          navLog('extract-err', lastErr);
        }
        const okNow = r && r.html && /(?:星期|周)[一二三四五六日天]/.test(r.html);
        if (okNow) break;
        if (i < 2) await new Promise((res) => setTimeout(res, 900));
      }
      if (r) navLog('extract-scan', `tables=${r.tables} bytes=${Number(r.bytes)||0} week=${/(?:星期|周)[一二三四五六日天]/.test(r.html||'')} url=${r.url||''}`);

      // 页面加载时抢的快照里有课表就直接用，省得跟异步渲染抢时间
      if ((!r || !r.html || !/(?:星期|周)[一二三四五六日天]/.test(r.html)) &&
          snapCache.html && /(?:星期|周)[一二三四五六日天]/.test(snapCache.html)) {
        r = { title: '课表（加载快照）', url: snapCache.url, html: snapCache.html, tables: 0, bytes: snapCache.html.length };
        navLog('extract-snapshot', `bytes=${snapCache.html.length} age=${Date.now() - snapCache.at}ms`);
      }

      // 课表可能画在 iframe 里：主框架取不到就逐个 frame 再取一次
      if (!r || !r.html || !/(?:星期|周)[一二三四五六日天]/.test(r.html)) {
        const frames = win.webContents.mainFrame.frames || [];
        for (const f of frames) {
          try {
            const fr = await f.executeJavaScript(EXTRACT, true);
            if (fr && fr.html && /(?:星期|周)[一二三四五六日天]/.test(fr.html)) { r = fr; break; }
          } catch (e) { /* 跨域 frame 直接跳过 */ }
        }
      }

      // 无论成败，先把整页存一份，保证有真实 DOM 可查
      let full = '';
      try { full = await win.webContents.executeJavaScript('document.documentElement.outerHTML', true); } catch (e) { /* 忽略 */ }
      if (full) dumpDebug('raw', full);

      if (r && r.html && /(?:星期|周)[一二三四五六日天]/.test(r.html)) {
        dumpDebug('ok', r.html);          // 成功也存一份，便于核对解析规则
        navLog('extract-ok', `tables=${r.tables} bytes=${r.html.length} url=${r.url}`);
        finish({ ok: true, html: r.html, url: r.url, title: r.title, tables: r.tables });
        return;
      }

      // 抓不到：把真实 DOM 存盘，便于按页面结构调选择器
      dumpDebug('table', r && r.html ? r.html : (full || ''));
      const bad = (r && r.html ? r.html : '') + (full || '');
      navLog('extract-bad', `bytes=${bad.length} err=${lastErr || 'none'}`);
      if (/MethodFailedException|OGNL|method .* failed/i.test(bad)) {
        // 少参数导致 Struts 抛错：带上 setting.kind 再试一次
        if (!triedAlt) {
          triedAlt = true;
          setHint('课表地址参数不全，换一种方式重试…');
          win.loadURL(TABLE_URL_ALT);
          setTimeout(() => { if (!settled) { extractStarted = false; extract(); } }, 2600);
          return;
        }
      }

      // 还不行就去课表查询页：那里有学期下拉，必要时点一次“查询”
      if (!triedIndex) {
        triedIndex = true;
        setHint('改走课表查询页…');
        win.loadURL(TABLE_INDEX);
        setTimeout(() => { if (!settled) { extractStarted = false; extract(); } }, 2600);
        return;
      }

      if (!triedClick) {
        triedClick = true;
        try { await win.webContents.executeJavaScript(CLICK_QUERY, true); } catch (e) { /* 忽略 */ }
        setHint('尝试触发课表查询…');
        setTimeout(() => { if (!settled) { extractStarted = false; extract(); } }, 2200);
        return;
      }

      finish({ ok: false, reason: '课表页里没找到课表（已试过直接地址、带参地址、查询页），页面 DOM 已存入 hpu-shell\\debug' });
      return;
    } catch (e) {
      const msg = String((e && e.message) || e);
      navLog('extract-catch', msg);
      try {
        const full = await win.webContents.executeJavaScript('document.documentElement.outerHTML', true);
        if (full) dumpDebug('raw', full);
      } catch (e2) { /* 页面可能已销毁 */ }
      finish({ ok: false, reason: '抓取课表失败：' + msg });
    }
  }

  function dumpDebug(name, html) {
    try {
      const dir = path.join(__dirname, 'debug');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const f = path.join(dir, `${name}-${stamp}.html`);
      const head = `<!-- url=${win.webContents.getURL()} -->\n`;
      fs.writeFileSync(f, head + (html || ''), 'utf8');
      console.log('DEBUG_DUMP ' + f);
    } catch (e) { /* 忽略 */ }
  }

  // 轮询式判定：不依赖某一次导航事件，登录页一律不主动跳转
  let innerSince = 0;

  async function gotoTable() {
    let found = { href: '', semesterId: '' };
    try { found = await win.webContents.executeJavaScript(FIND_TABLE, true) || found; } catch (e) { /* 忽略 */ }
    // 先把首页 DOM 存一份，方便按真实菜单调选择器
    try {
      const home = await win.webContents.executeJavaScript('document.documentElement.outerHTML', true);
      dumpDebug('home', home);
    } catch (e) { /* 忽略 */ }

    let target = '';
    if (found.href) target = new URL(found.href, 'https://zhjw.hpu.edu.cn').href;
    else if (found.semesterId) target = `${TABLE_URL}?semesterId=${found.semesterId}&setting.kind=std&ignoreHead=1`;
    else target = TABLE_URL;

    setHint('已登录，正在打开个人课表…');
    navLog('load-table', target);
    win.loadURL(target);
  }

  function check() {
    if (settled || extractStarted || win.isDestroyed()) return;
    const url = win.webContents.getURL();
    if (!url || /about:blank|^data:/.test(url)) return;

    if (/courseTableForStd/i.test(url)) { extract(); return; }

    if (/uia\.hpu\.edu\.cn/i.test(url) || /unifiedIdentity|sso/i.test(url)) {
      setHint('统一身份认证 · 请在窗口内登录');
      return;
    }

    if (/zhjw\.hpu\.edu\.cn/i.test(url)) {
      if (/\/login(Ext)?\.action/i.test(url) || /\/cas/i.test(url)) {
        innerSince = 0;
        // 教务自己的登录页：用户可在此直接登录；带 ticket 说明 SSO 已回跳，稍后进首页
        setHint(/ticket=/i.test(url) ? '身份校验中…' : '教务登录 · 请在窗口内登录');
        // 单独的标志：票据回跳只处理一次，不能占掉“切课表”的机会
        if (/ticket=/i.test(url) && !wentHome) {
          wentHome = true;
          navLog('ticket', url);
          setTimeout(() => { if (!settled && !win.isDestroyed()) win.loadURL(HOME_URL); }, 2500);
        }
        return;
      }
      // 已进入教务内部页面：等跳转稳定 2.2 秒再动，避免抢在票据交换前跳走
      if (!innerSince) {
        innerSince = Date.now();
        setHint('已登录，正在进入教务首页…');
        return;
      }
      if (Date.now() - innerSince < 2200) return;
      if (!triedTable) {
        triedTable = true;
        gotoTable();
      }
      return;
    }

    setHint('校内页面');
  }

  timer = setInterval(check, 1200);

  async function logCookies(tag) {
    try {
      const cs = await win.webContents.session.cookies.get({ domain: 'hpu.edu.cn' });
      navLog('cookie', `${tag} count=${cs.length} names=${cs.map(c => c.name).join('|')}`);
    } catch (e) { /* 忽略 */ }
  }

  win.webContents.on('did-navigate', (_e, url) => { navLog('nav', url); logCookies(url); });
  win.webContents.on('did-navigate-in-page', (_e, url) => navLog('nav-in-page', url));
  win.webContents.on('did-fail-load', (_e, code, desc, url) => {
    navLog('fail', `${code} ${desc} ${url}`);
    if (code === -3) return;                                  // 主动中断不算错
    finish({ ok: false, reason: `打不开 ${url}（${desc}）` });
  });

  win.loadURL(CAS_LOGIN);   // 学校统一认证（教务「从平台登录」同一条链）
  navLog('start', CAS_LOGIN);
  win.on('closed', () => finish({ ok: false, reason: '已取消登录' }));

  // 兜底：10 分钟没结果就结束，避免窗口挂着
  setTimeout(() => finish({ ok: false, reason: '登录超时，请重试' }), 10 * 60 * 1000);
}));

/* ---------------- 成绩抓取（综合教务 → 课程与成绩 → 学生申请成绩覆盖） ----------------
   与抓课表同一条 CAS 会话；登录后直接进 std-grade-modify-apply.action 取表格。 */
const GRADE_URL = 'https://zhjw.hpu.edu.cn/eams/teach/grade/course/std-grade-modify-apply.action';

const GRADE_EXTRACT = `(() => {
  const norm = (s) => (s || '').replace(/\\s+/g, '').trim();
  const tables = Array.from(document.querySelectorAll('table'));
  const t = tables.find(tb => /学分/.test(tb.textContent) && /(总评成绩|最终成绩|绩点)/.test(tb.textContent));
  if(!t) return { ok: false, reason: '没找到成绩表', text: norm(document.body.innerText).slice(0, 160) };
  const rows = Array.from(t.rows);
  let h = rows.findIndex(r => /(学年学期|课程名称)/.test(r.textContent) && Array.from(r.cells).some(c => /学分/.test(c.textContent)));
  if(h < 0) h = 0;
  const heads = Array.from(rows[h].cells).map(c => norm(c.textContent));
  const out = [];
  for(let i = h + 1; i < rows.length; i++){
    const cs = Array.from(rows[i].cells).map(c => norm(c.textContent));
    if(cs.length < 6) continue;
    const o = {};
    heads.forEach((name, j) => { if(name && o[name] === undefined) o[name] = cs[j] || ''; });
    if(Object.keys(o).length) out.push(o);
  }
  const first = out[0] ? Object.values(out[0]).join('/') : '';
  const last = out.length ? Object.values(out[out.length - 1]).join('/') : '';
  const pager = document.querySelector('.pageFooter, #pageFooter, .pageInfo, #pageInfo, .pagingbar, .pagination');
  return { ok: true, heads, rows: out, count: out.length, sig: first + '#' + last, pageInfo: norm(pager ? pager.textContent : ''), url: location.href };
})()`;

/* 翻页：正方教务的成绩页底部是 pageFooter（「1 - 50 of 50」+ 下一页箭头）。
   这里按可控顺序找“下一页”控件：先看 pageFooter 内的链接/图片，再看全局 changePage，再退回带 pageNo 的链接。
   返回 { hit, how }；hit=false 表示已到最后一页或找不到翻页控件。 */
const GRADE_NEXT = `(() => {
  const vis = (n) => n && n.offsetParent !== null;
  const nextRe = /下一?页|next|»|＞|>/i;
  // 先看分页条文字：已经到最后一页就不点了，避免多翻一次
  const pinfo = document.querySelector('.pageInfo, #pageInfo, .pageFooter, #pageFooter');
  const ptxt = (pinfo ? pinfo.textContent : '').replace(/\\s+/g, '');
  const pm = ptxt.match(/(\\d+)-(\\d+)(?:of|\\/)(\\d+)/i);
  if(pm && parseInt(pm[2], 10) >= parseInt(pm[3], 10)) return { hit: false, how: 'last' };
  const inPager = (root) => root ? Array.from(root.querySelectorAll('a,button,input[type=image],img,i,span'))
    .filter(n => vis(n) && (nextRe.test(n.getAttribute('title') || '') || nextRe.test(n.getAttribute('alt') || '')
      || nextRe.test(n.textContent || '') || nextRe.test(n.value || '') || nextRe.test(n.className || '')))
    .filter(n => !/disabled|off|gray|ban/i.test(n.className || '')) : [];
  const pager = document.querySelector('.pageFooter, #pageFooter, .pagingbar, .pagination, .pagebar');
  let cands = inPager(pager);
  if(!cands.length) cands = inPager(document.querySelector('.pageFooter, .pagingbar') || document.body)
    .slice(0, 4);
  // 优先取最靠右（最右通常是“下一页”，最左是“上一页”）
  if(cands.length){
    const el = cands.map(n => (n.closest('a') || n)).filter((n, i, a) => a.indexOf(n) === i)
      .sort((a, b) => b.getBoundingClientRect().left - a.getBoundingClientRect().left)[0];
    if(el){
      const href = el.getAttribute('href') || '';
      const oc = el.getAttribute('onclick') || '';
      if(/^javascript:changePage\\(/i.test(href) || /changePage\\(/i.test(oc)) { el.click(); return { hit: true, how: 'changePage-link' }; }
      if(href && !/^#|javascript:void/i.test(href)) { el.click(); return { hit: true, how: 'href' }; }
      el.click(); return { hit: true, how: 'click' };
    }
  }
  // 表单式：输入页码 + 回车 / 点“跳转”
  const inp = document.querySelector('input[name*=pageNo i], input[id*=pageNo i], input[name*=pageIndex i]');
  if(inp){
    const cur = parseInt(inp.value, 10) || 1;
    inp.value = String(cur + 1);
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
    const go = Array.from(document.querySelectorAll('a,button,input[type=button],input[type=submit]'))
      .find(n => vis(n) && /跳转|GO|Go|确定/i.test((n.value || '') + (n.textContent || '')));
    if(go){ go.click(); return { hit: true, how: 'pageInput' }; }
    return { hit: true, how: 'pageInput-enter' };
  }
  if(typeof window.changePage === 'function'){
    const m = (document.querySelector('.pageInfo, #pageInfo, .pageFooter') && document.querySelector('.pageInfo, #pageInfo, .pageFooter').textContent || '').match(/^\\s*(\\d+)\\s*-\\s*(\\d+)\\s*(?:of|\\/)\\s*(\\d+)/i);
    const pageSize = m ? parseInt(m[2], 10) : 50;
    const total = m ? parseInt(m[3], 10) : 0;
    const cur = m ? Math.ceil(parseInt(m[1], 10) / pageSize) : 1;
    if(total && (cur + 1) * pageSize - pageSize >= total) return { hit: false, how: 'last(changePage)' };
    try { window.changePage(cur + 1, null); return { hit: true, how: 'changePage()' }; } catch(e){}
  }
  return { hit: false, how: 'none' };
})()`;

const GRADE_SIG = `(() => {
  const t = Array.from(document.querySelectorAll('table')).find(tb => /学分/.test(tb.textContent) && /(总评成绩|最终成绩|绩点)/.test(tb.textContent));
  if(!t) return 'none';
  const body = Array.from(t.rows).slice(1);
  const txt = body.map(r => (r.textContent || '').replace(/\\s+/g, '')).join('|');
  return body.length + '#' + txt.slice(0, 40) + '#' + txt.slice(-40);
})()`;

function normalizeGrades(r){
  const pick = (o, ks) => {
    for(const k of ks){ const v = o[k]; if(v !== undefined && v !== '') return String(v); }
    return '';
  };
  return (r.rows || []).map(o => ({
    term:   pick(o, ['学年学期', '学期']),
    code:   pick(o, ['原课程代码', '课程代码']),
    name:   pick(o, ['原课程名称', '课程名称']),
    cat:    pick(o, ['课程类别']),
    attr:   pick(o, ['原课程属性', '课程属性']),
    credit: parseFloat(pick(o, ['学分']).replace(/[^\d.]/g, '')) || 0,
    score:  pick(o, ['总评成绩']),
    final:  pick(o, ['最终成绩']),
    gpa:    parseFloat(pick(o, ['绩点']).replace(/[^\d.]/g, '')) || 0,
    status: pick(o, ['申请状态']),
  })).filter(x => x.name);
}

ipcMain.handle('hpu:grades', () => new Promise((resolve) => {
  const win = new BrowserWindow({
    width: 1000, height: 920, minWidth: 460, minHeight: 640,
    parent: mainWin || undefined,
    title: '成绩 · 登录教务',
    show: false,                 // 先不弹窗：有会话就直接后台取，需要登录才显示
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  harden(win.webContents);

  let settled = false, wentGrade = false, extracting = false;
  const finish = (p) => {
    if(settled) return;
    settled = true;
    clearInterval(timer);
    if(!win.isDestroyed()) win.close();
    resolve(p);
  };

  async function extract(){
    if(extracting || settled) return;
    extracting = true;
    let last = null;
    for(let i = 0; i < 3; i++){
      try{
        const r = await win.webContents.executeJavaScript(GRADE_EXTRACT, true);
        last = r;
        if(r && r.ok && r.rows && r.rows.length){
          const all = r.rows.slice();
          const seen = new Set(all.map(o => Object.values(o).join('|')));
          let sig = r.sig, pages = 1, how = '';
          // 自动翻页：抓完一页就看有没有“下一页”，直到页内容不再变化或到末页
          for(let p = 2; p <= 30; p++){
            const nx = await win.webContents.executeJavaScript(GRADE_NEXT, true);
            how = (nx && nx.how) || '';
            if(!nx || !nx.hit){ break; }
            let changed = false;
            for(let w = 0; w < 6; w++){   // 最多等 3 秒
              await new Promise((r2) => setTimeout(r2, 500));
              if(settled || win.isDestroyed()) break;
              const sg = await win.webContents.executeJavaScript(GRADE_SIG, true);
              if(sg && sg !== 'none' && sg !== sig){ sig = sg; changed = true; break; }
            }
            if(!changed){ how = 'no-change'; break; }
            const rr = await win.webContents.executeJavaScript(GRADE_EXTRACT, true);
            if(!rr || !rr.ok || !rr.rows.length){ break; }
            const fresh = rr.rows.filter(o => !seen.has(Object.values(o).join('|')));
            fresh.forEach(o => seen.add(Object.values(o).join('|')));
            if(!fresh.length){ how = 'dup'; pages = p; break; }
            all.push(...fresh);
            pages = p;
          }
          const rows = normalizeGrades({ rows: all });
          navLog('grade-ok', `rows=${rows.length} pages=${pages} next=${how} heads=${(r.heads||[]).join('|')} pageInfo=${r.pageInfo || ''}`);
          return finish({ ok: true, rows, heads: r.heads, count: rows.length, pages, next: how, pageInfo: r.pageInfo || '', url: r.url });
        }
      }catch(e){ navLog('grade-err', String((e && e.message) || e)); }
      await new Promise((r2) => setTimeout(r2, 1200));
    }
    // 解析不出来：整页存盘，便于按真实 DOM 调列名
    try{
      const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML', true);
      const dir = path.join(__dirname, 'debug');
      if(!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'grade-page.html'), html, 'utf8');
    }catch(e){ /* 忽略 */ }
    finish({ ok: false, reason: (last && (last.reason || last.text)) || '成绩页里没解析出数据', debug: 'hpu-shell\\debug\\grade-page.html' });
  }

  const timer = setInterval(() => {
    if(settled || win.isDestroyed()) return;
    const u = win.webContents.getURL();
    if(!u || /about:blank/.test(u)) return;
    // 落在登录页：说明没有会话，把窗口亮出来让用户登录
    if(/login(Ext)?\.action|\/cas|uia\.hpu\.edu\.cn/i.test(u)){
      if(!win.isVisible()){ win.show(); win.setTitle('统一身份认证 · 请在此登录'); }
      return;
    }
    if(/std-grade-modify-apply/.test(u)){
      if(!extracting) setTimeout(extract, 1400);
      return;
    }
    // 已进教务内部页（非登录页）：切到成绩覆盖
    if(/zhjw\.hpu\.edu\.cn/.test(u) && !/ticket=/i.test(u)){
      if(!wentGrade){
        wentGrade = true;
        win.setTitle('已登录，正在打开学生申请成绩覆盖…');
        setTimeout(() => { if(!settled && !win.isDestroyed()) win.loadURL(GRADE_URL); }, 1200);
      }
    }
  }, 1000);

  win.loadURL(CAS_LOGIN);
  navLog('grade-start', CAS_LOGIN);
  win.on('closed', () => finish({ ok: false, reason: '已取消' }));
  setTimeout(() => finish({ ok: false, reason: '登录超时，请重试' }), 10 * 60 * 1000);
}));

/* ---------------- 教学平台（sj.hpu.edu.cn）课表 ----------------
   综合教务（zhjw）的课表不含实验课，完整课表在实验/实习教学平台。
   该站是 SPA，数据走 /teach/stuTime/* 接口（带登录态的 session，未登录 401），
   所以不在外部拼请求，直接在登录后的页面里用 fetch 取 JSON。 */
const SJ_URL = 'http://sj.hpu.edu.cn/TEACH/#/6001/modules/teach/stu/timeTable/yearterm';
const SJ_BASE = 'http://sj.hpu.edu.cn/TEACH/';
// 实际入口：统一认证 → 实验实践教学管理平台门户 → 点“实验教学” → 点“个人总课表”
const SJ_CAS = 'https://uia.hpu.edu.cn/cas/login?service=http%3A%2F%2Fsj.hpu.edu.cn%2Fhpu%2F#/';
const SJ_PORTAL = 'http://sj.hpu.edu.cn/hpu/';

// 门户首页点“实验教学”卡片（若是普通链接就直接取 href）
const CLICK_EXP = `(() => {
  const vis = (n) => n && n.offsetParent !== null;
  const nodes = Array.from(document.querySelectorAll('a,button,div,span,li'));
  const hit = nodes.find(n => vis(n) && (n.textContent || '').trim() === '实验教学')
    || nodes.find(n => vis(n) && /实验教学/.test((n.textContent || '').trim()) && (n.textContent || '').trim().length <= 12);
  if (hit) {
    const a = hit.closest('a');
    if (a && a.href) return { clicked: false, href: a.href };
    hit.click();
    return { clicked: true, href: '' };
  }
  const a = Array.from(document.querySelectorAll('a')).find(x => /TEACH|teach/i.test(x.href || ''));
  if (a) return { clicked: false, href: a.href };
  return { clicked: false, href: '' };
})()`;

// 教学平台里点左侧“个人总课表”
const CLICK_TABLE = `(() => {
  const vis = (n) => n && n.offsetParent !== null;
  const nodes = Array.from(document.querySelectorAll('a,button,div,span,li'));
  const hit = nodes.find(n => vis(n) && /个人总课表|总课表/.test((n.textContent || '').trim()) && (n.textContent || '').trim().length <= 10);
  if (hit) { hit.click(); return 'clicked'; }
  return 'none';
})()`;

// 取课表表格（6 节块 × 7 天），顺便把接口 JSON 也捞一份便于核对
const SJ_EXTRACT = `(async () => {
  const post = async (u, body, headers) => {
    try {
      const r = await fetch(u, {
        method: 'POST', credentials: 'include',
        headers: Object.assign({ 'Content-Type': 'application/json;charset=UTF-8' }, headers || {}),
        body: JSON.stringify(body || {})
      });
      return { status: r.status, text: (await r.text()).slice(0, 400000) };
    } catch (e) { return { status: 0, text: '', err: String((e && e.message) || e) }; }
  };
  // 页面里的 token（SPA 通常放 localStorage）
  const stor = {};
  try {
    for (const s of [localStorage, sessionStorage]) {
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i), v = s.getItem(k) || '';
        stor[k] = v.slice(0, 300);
      }
    }
  } catch (e) {}
  const tokens = Object.keys(stor).filter(k => /token|auth|jwt|ticket/i.test(k) || /eyJ[A-Za-z0-9]/.test(stor[k]))
    .map(k => stor[k]).filter(v => v && v.length > 10);

  const table = [...document.querySelectorAll('table')].find(t => /星期一/.test(t.textContent) && /节次|上午|下午/.test(t.textContent));
  const out = {
    url: location.href, title: document.title,
    hasTable: !!table,
    html: table ? table.outerHTML : '',
    dom: document.documentElement.outerHTML,
    storage: stor,
    tried: []
  };
  // 接口鉴权：先直接试，再分别带 token / Bearer 试
  const tries = [{}, ...tokens.slice(0, 2).map(t => ({ token: t })), ...tokens.slice(0, 2).map(t => ({ Authorization: 'Bearer ' + t }))];
  for (const h of tries) {
    const r = await post('/teach/stuTime/listStuYearterm', {}, h);
    out.tried.push({ headers: Object.keys(h).join(',') || 'none', status: r.status, head: (r.text || '').slice(0, 80) });
    if (r.status === 200) { out.yearterm = r; break; }
  }
  if (out.yearterm) {
    out.course = await post('/teach/stuTime/listStuCourse', {});
    // 实验课的房间/教师/周次明细：按单元格里 onclick 的 course_id 拉一次
    const ids = [];
    if (table) {
      [...table.querySelectorAll('a')].forEach(a => {
        const m = (a.getAttribute('onclick') || '').match(/time\\('([0-9A-Za-z_.]+)-/);
        if (m && ids.indexOf(m[1]) < 0) ids.push(m[1]);
      });
    }
    out.groups = {};
    for (const id of ids.slice(0, 30)) {
      const g = await post('/teach/stuTime/getGroupTimeByCourse?course=' + encodeURIComponent(id), {});
      if (g.status === 200) out.groups[id] = g.text;
    }
    // 接口要是拿不到，就点开第一门实验课的“分组时间详情”看看里面有什么
    out.dialog = null;
    if (!Object.keys(out.groups).length && ids.length && typeof window.time === 'function') {
      try {
        window.time(ids[0] + '-1-1');
        await new Promise(r => setTimeout(r, 600));
        const dlg = document.querySelector('.el-dialog, .el-drawer, .ant-modal');
        out.dialog = dlg ? dlg.innerText.slice(0, 2000) : 'no-dialog';
        const x = dlg && dlg.querySelector('.el-dialog__headerbtn');
        if (x) x.click();
      } catch (e) { out.dialog = 'err:' + String((e && e.message) || e); }
    }
  }
  return out;
})()`;

const SJ_PROBE = `(async () => {
  try {
    let r = await fetch('/teach/stuTime/listStuYearterm', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json;charset=UTF-8' }, body: '{}'
    });
    if (r.status === 415 || r.status === 400) {
      r = await fetch('/teach/stuTime/listStuYearterm', { method: 'POST', credentials: 'include', body: '' });
    }
    return { status: r.status, head: (await r.text()).slice(0, 200) };
  } catch (e) { return { status: 0, head: String((e && e.message) || e) }; }
})()`;

const SJ_PULL = `(async () => {
  const post = async (u, body) => {
    try {
      const r = await fetch(u, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json;charset=UTF-8' },
        body: JSON.stringify(body || {})
      });
      return { status: r.status, text: (await r.text()).slice(0, 400000) };
    } catch (e) { return { status: 0, text: '', err: String((e && e.message) || e) }; }
  };
  const out = { url: location.href, title: document.title };
  out.yearterm = await post('/teach/stuTime/listStuYearterm', {});
  out.course = await post('/teach/stuTime/listStuCourse', {});
  out.page = await post('/teach/stuTime/listStuTimePage', { page: 1, pageSize: 200 });
  out.jc = await post('/teach/teachJcSection/listJcSection', {});
  out.dom = document.documentElement.outerHTML;
  return out;
})()`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

ipcMain.handle('hpu:sj-timetable', () => new Promise((resolve) => {
  const win = new BrowserWindow({
    width: 1180, height: 940, minWidth: 520, minHeight: 600,
    parent: mainWin || undefined,
    title: '教学平台 · 请在窗口内登录',
    autoHideMenuBar: true, backgroundColor: '#ffffff',
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  harden(win.webContents);

  // 门户点“实验教学”可能新开窗口：拦下来在本窗口内打开，便于后续自动取数
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/sj\.hpu\.edu\.cn|uia\.hpu\.edu\.cn/i.test(url)) {
      setTimeout(() => { if (!win.isDestroyed()) win.loadURL(url); }, 80);
    }
    return { action: 'deny' };
  });

  let settled = false;
  let timer = null;
  let clickedExp = false;
  let clickedTable = false;
  let tries = 0;

  const finish = (payload) => {
    if (settled) return;
    settled = true;
    if (timer) clearInterval(timer);
    if (!win.isDestroyed()) win.close();
    resolve(payload);
  };

  const save = (data) => {
    try {
      const dir = path.join(__dirname, 'debug');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const meta = {
        yearterm: data.yearterm ? { status: data.yearterm.status, bytes: (data.yearterm.text || '').length } : null,
        course: data.course ? { status: data.course.status, bytes: (data.course.text || '').length } : null,
        tried: data.tried || null,
      };
      fs.writeFileSync(path.join(dir, `sj-${stamp}.json`),
        JSON.stringify({ meta, url: data.url, title: data.title,
          storage: data.storage || null,
          yearterm: data.yearterm && data.yearterm.text,
          course: data.course && data.course.text,
          groups: data.groups || null,
          dialog: data.dialog || null }, null, 1), 'utf8');
      if (data.html) fs.writeFileSync(path.join(dir, `sj-table-${stamp}.html`), data.html, 'utf8');
      if (data.dom) fs.writeFileSync(path.join(dir, `sj-dom-${stamp}.html`), data.dom, 'utf8');
      navLog('sj-pull', `stamp=${stamp} table=${(data.html || '').length} yearterm=${meta.yearterm && meta.yearterm.bytes}`);
    } catch (e) { navLog('sj-save-err', String((e && e.message) || e)); }
  };

  const setTitle = (t) => { if (!win.isDestroyed()) win.setTitle(t); };

  const poll = async () => {
    if (settled || win.isDestroyed()) return;
    try {
      const url = win.webContents.getURL();
      if (!url || /about:blank|^data:/.test(url)) return;

      // 1) 统一认证页
      if (/uia\.hpu\.edu\.cn/i.test(url)) { setTitle('统一身份认证 · 请在窗口内登录'); return; }

      // 2) 实验实践教学平台门户：点“实验教学”
      if (/sj\.hpu\.edu\.cn\/hpu/i.test(url)) {
        setTitle(clickedExp ? '正在打开实验教学…' : '已登录，正在进入实验教学…');
        if (!clickedExp) {
          clickedExp = true;
          const r = await win.webContents.executeJavaScript(CLICK_EXP, true).catch(() => null);
          if (r && r.href) { navLog('sj-exp-href', r.href); win.loadURL(r.href); }
          else if (r && r.clicked) navLog('sj-exp-click', 'clicked');
          else navLog('sj-exp-miss', '没找到实验教学入口');
        }
        return;
      }

      // 3) 教学平台（TEACH）：点“个人总课表”，再取表格
      if (/sj\.hpu\.edu\.cn\/TEACH/i.test(url)) {
        if (!clickedTable) {
          setTitle('已进入教学平台，正在打开个人总课表…');
          clickedTable = true;
          const c = await win.webContents.executeJavaScript(CLICK_TABLE, true).catch(() => 'none');
          navLog('sj-table-click', String(c));
          await sleep(1500);
        }
        const res = await win.webContents.executeJavaScript(SJ_EXTRACT, true)
          .catch((e) => ({ hasTable: false, err: String((e && e.message) || e) }));
        if (res && res.hasTable) {
          setTitle('已取到总课表，正在解析…');
          save(res);
          finish({ ok: true, url: res.url, title: res.title, html: res.html,
            yearterm: res.yearterm && res.yearterm.text,
            course: res.course && res.course.text,
            groups: res.groups || null,
            dom: res.dom });
          return;
        }
        // 兜底：直接跳到已知课表路由
        tries++;
        if (tries === 3) {
          navLog('sj-fallback', SJ_URL);
          win.loadURL(SJ_URL);
        }
        return;
      }

      setTitle('教学平台 · 等待页面…');
    } catch (e) {
      navLog('sj-poll-err', String((e && e.message) || e));
    }
  };

  win.webContents.on('did-navigate', (_e, url) => navLog('sj-nav', url));
  win.webContents.on('did-navigate-in-page', (_e, url) => navLog('sj-nav-in-page', url));
  win.on('closed', () => { if (!settled) { settled = true; if (timer) clearInterval(timer); resolve({ ok: false, reason: '已取消' }); } });

  timer = setInterval(poll, 1400);
  win.loadURL(SJ_CAS);
  navLog('sj-start', SJ_CAS);
  setTimeout(() => poll(), 1200);
  setTimeout(() => finish({ ok: false, reason: '教学平台登录超时，请重试' }), 6 * 60 * 1000);
}));

/* ---------------- 应用内打开 ---------------------------- */
/* 统一入口：学校教务自带的账号密码页有问题，只有走统一身份认证才能正常进系统。
   所以打开教务页时不再直连 eams，而是先进 CAS；登录完成落到教务内部页后，再跳到目标页。
   CAS 认证页保持手机竖屏，登录完落到教务桌面页时把窗口放宽，表格才看得清。 */
function attachUnifiedEntry(w, mode, target) {
  const norm = (u) => String(u || '').replace(/;jsessionid=[^?#]*/i, '');
  let wentCas = false, delivered = false, grown = false;
  const grow = () => {
    if (grown || w.isDestroyed()) return;
    grown = true;
    try {
      const b = w.getBounds();
      if (b.width < 900) w.setBounds({ x: b.x, y: b.y, width: 1080, height: 800 });
    } catch (e) { /* 忽略 */ }
  };
  const onLoad = () => {
    if (w.isDestroyed()) return;
    const clean = norm(w.webContents.getURL());
    if (/\/eams\/loginExt\.action/i.test(clean) && !wentCas) {
      wentCas = true;
      w.loadURL(CAS_LOGIN).catch((e) => console.log('ENTRY_CAS_ERR ' + ((e && e.message) || e)));
      return;
    }
    if (/uia\.hpu\.edu\.cn|\/cas\/login|\/sso\/login/i.test(clean)) return;   // 认证页，等用户登录
    if (/\/eams\/login\.action/i.test(clean)) return;                        // CAS 回跳中
    if (!/\/eams\/home(Ext)?\.action/i.test(clean)) return;   // 只认登录完成后的教务首页（中途的 eams 根/错误页不算）
    grow();
    if (mode !== 'page' || delivered) return;
    if (clean === norm(target)) { delivered = true; return; }
    delivered = true;
    console.log('ENTRY_DELIVER ' + clean + ' -> ' + target.slice(0, 70));
    setTimeout(() => { if (!w.isDestroyed()) w.loadURL(target).catch((e) => console.log('ENTRY_DELIVER_ERR ' + ((e && e.message) || e))); }, 600);
  };
  w.webContents.on('did-finish-load', onLoad);
  w.webContents.on('did-navigate-in-page', onLoad);
}

function openEntryWindow(url, title) {
  const w = openChild(CAS_LOGIN, title || '统一身份认证 · 教务', { width: 1080, height: 800 });
  attachUnifiedEntry(w, 'page', url);
  return w;
}

ipcMain.handle('hpu:open', (_e, { url, title }) => {
  // 手机 H5（座位/认证）走手机 UA 竖屏；教务页一律先进统一认证，避免撞上坏掉的 eams 登录页
  const mobile = MOBILE_HOST_RE.test(url || '');
  const desktop = !mobile && DESKTOP_HOST_RE.test(url || '');
  let w;
  if (mobile) {
    w = openChild(url, title, { ua: MOBILE_UA, width: 430, height: 880 });
    attachUnifiedEntry(w, 'auth', url);
  } else if (desktop) {
    w = openEntryWindow(url, title);
  } else {
    w = openChild(url, title, {});
  }
  if (/free!index|publicFree/i.test(url || '')) watchFreePage(w);
  return { ok: true, opened: url, mobile, desktop, entry: !!desktop };
});

/* 手动快照：用户在子窗口里自己走到「空闲教室」后，点 App 里的「保存当前页面」按钮，
   把当前子窗口的控件/表格/整页 HTML 落到 debug/，用来定原生表格的字段。 */
const SNAP_JS = `(() => {
  const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const near = (el) => {
    const box = el.closest('td,tr,div,li,label,p');
    return t(box ? (box.innerText || '') : '').slice(0, 40);
  };
  const ctrls = Array.from(document.querySelectorAll('select,input,textarea')).map((el) => ({
    tag: el.tagName.toLowerCase(), type: el.type || '', name: el.name || '', id: el.id || '',
    label: near(el), value: String(el.value == null ? '' : el.value).slice(0, 30),
    opts: el.tagName === 'SELECT' ? Array.from(el.options).slice(0, 40).map((o) => ({ v: o.value, t: t(o.textContent).slice(0, 24) })) : undefined
  })).slice(0, 80);
  const btns = Array.from(document.querySelectorAll('input[type=button],input[type=submit],button,a'))
    .map((b) => ({ t: t(b.value || b.textContent).slice(0, 20), id: b.id || '', onclick: (b.getAttribute('onclick') || '').slice(0, 140), href: (b.getAttribute('href') || '').slice(0, 90) }))
    .filter((b) => /查询|检索|搜索|空闲|教室/i.test(b.t + b.onclick + b.href)).slice(0, 20);
  const tables = Array.from(document.querySelectorAll('table')).map((tb, i) => {
    const rows = Array.from(tb.rows).map((r) => Array.from(r.cells).map((c) => t(c.innerText).slice(0, 26)));
    return { i, n: rows.length, head: rows.slice(0, 3), sample: rows.slice(3, 10) };
  }).filter((x) => x.n >= 1);
  return { url: location.href, title: document.title, ctrls, btns, tables, text: t(document.body.innerText).slice(0, 1200) };
})()`;

ipcMain.handle('hpu:freeSnap', async () => {
  if (!childWin || childWin.isDestroyed()) return { ok: false, reason: '没有打开的应用内窗口' };
  const url = childWin.webContents.getURL();
  if (!/hpu\.edu\.cn/i.test(url)) return { ok: false, reason: '当前窗口不是教务页面（' + url + '）' };
  if (/loginExt|login\.action|\/cas/i.test(url)) return { ok: false, reason: '还在登录页，先登录并进入空闲教室查询' };
  const dir = path.join(__dirname, 'debug');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  try {
    const form = await childWin.webContents.executeJavaScript(SNAP_JS, true);
    fs.writeFileSync(path.join(dir, 'free-snap.json'), JSON.stringify({ stage: 'form', form }, null, 2), 'utf8');
    // 表单页上补一组默认条件（今天 + 08:00-09:40）真查一次，把结果表也拿下来
    const q = await childWin.webContents.executeJavaScript(`(() => {
      window.alert = (m) => { window.__lastAlert = String(m); };
      window.confirm = () => true;
      const d = new Date();
      const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      const setV = (name, v) => {
        const el = document.querySelector('[name="' + name + '"]');
        if (!el) return false;
        el.value = v;
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      setV('cycleTime.dateBegin', iso); setV('cycleTime.dateEnd', iso);
      setV('timeBegin', '08:00'); setV('timeEnd', '09:40');
      setV('cycleTime.cycleCount', '1');
      const rt = document.querySelector('[name="roomApplyTimeType"]');
      if (rt) { rt.value = '1'; rt.dispatchEvent(new Event('change', { bubbles: true })); }
      const btn = Array.from(document.querySelectorAll('input[type=button],button'))
        .find((b) => String(b.value || b.textContent).trim() === '查询');
      if (btn) { btn.click(); return { how: 'btn', date: iso }; }
      if (typeof searchFreeApply === 'function') { searchFreeApply(); return { how: 'fn', date: iso }; }
      return { how: 'none' };
    })()`, true);
    await new Promise((r) => setTimeout(r, 4500));
    const res = await childWin.webContents.executeJavaScript(SNAP_JS, true);
    const html = await childWin.webContents.executeJavaScript('document.documentElement.outerHTML', true);
    fs.writeFileSync(path.join(dir, 'free-snap.html'), html, 'utf8');
    fs.writeFileSync(path.join(dir, 'free-snap.json'), JSON.stringify({ stage: 'result', query: q, form, res }, null, 2), 'utf8');
    const img = await childWin.webContents.capturePage();
    fs.writeFileSync(path.join(dir, 'free-snap.png'), img.toPNG());
    console.log('FREE_SNAP ' + JSON.stringify({ url: res.url, q, tables: res.tables.map((x) => x.n) }));
    return { ok: true, url: res.url, title: res.title, ctrls: form.ctrls.length,
      tables: res.tables.map((x) => ({ n: x.n, cols: (x.head[0] || []).length })), alert: (await childWin.webContents.executeJavaScript('window.__lastAlert || ""', true)) };
  } catch (e) {
    return { ok: false, reason: '保存失败：' + ((e && e.message) || e) };
  }
});

/* ---------------- 空闲教室：原生查询 ----------------
   页面实测（2026-11-27）：表单在 free!index.action.action，查询提交到 free!search.action，
   结果为 6 列表：序号 / 名称 / 教学楼 / 校区 / 教室设备配置 / 容量。
   做法：隐藏窗口复用登录态 → 填表 → 点查询 → 在新页面解析表格。 */
const FREE_INDEX = 'https://zhjw.hpu.edu.cn/eams/classroom/apply/std-activity.action';
const FREE_SEARCH = 'https://zhjw.hpu.edu.cn/eams/classroom/apply/free!search.action';
let freeWin = null;

function freeWindow() {
  if (freeWin && !freeWin.isDestroyed()) return freeWin;
  freeWin = new BrowserWindow({
    width: 1100, height: 820, show: false,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  harden(freeWin.webContents);
  freeWin.on('closed', () => { freeWin = null; });
  return freeWin;
}

function waitLoad(w, ms = 18000) {
  return new Promise((resolve) => {
    let done = false;
    const fire = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      w.webContents.removeListener('did-finish-load', fire);
      resolve();
    };
    const timer = setTimeout(fire, ms);
    w.webContents.on('did-finish-load', fire);
  });
}

const FREE_PARSE = `(() => {
  const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const fr = document.querySelector('iframe[name="freeRoomList"], iframe[name="freeRoomList"]');
  let doc = null;
  try { doc = fr && fr.contentDocument ? fr.contentDocument : null; } catch (e) { doc = null; }
  if (!doc || !doc.body) doc = document;
  const tables = Array.from(doc.querySelectorAll('table'));
  const pick = tables.find((tb) => {
    const head = tb.rows[0] ? Array.from(tb.rows[0].cells).map((c) => t(c.innerText)) : [];
    return head.length >= 5 && head.some((h) => /名称/.test(h)) && head.some((h) => /教学楼/.test(h)) && head.some((h) => /容量/.test(h));
  });
  if (!pick) return { rows: [], at: location.href, text: t((doc.body && doc.body.innerText) || '').slice(0, 400) };
  const head = Array.from(pick.rows[0].cells).map((c) => t(c.innerText));
  const idx = { name: head.findIndex((h) => /名称/.test(h)), building: head.findIndex((h) => /教学楼/.test(h)),
    campus: head.findIndex((h) => /校区/.test(h)), equip: head.findIndex((h) => /设备/.test(h)),
    cap: head.findIndex((h) => /容量/.test(h)) };
  const rows = Array.from(pick.rows).slice(1).map((r) => {
    const c = Array.from(r.cells).map((x) => t(x.innerText));
    return { name: c[idx.name] || '', building: c[idx.building] || '', campus: c[idx.campus] || '',
      equip: idx.equip >= 0 ? c[idx.equip] : '', cap: idx.cap >= 0 ? Number((c[idx.cap] || '').replace(/[^0-9]/g, '')) || 0 : 0 };
  }).filter((x) => x.name);
  return { rows, head, at: location.href };
})()`;

/* 把筛选条件填进教务的空闲教室表单；click=true 时顺便点「查询」 */
async function fillFreeForm(w, opts = {}, click = false) {
  return w.webContents.executeJavaScript(`(() => {
    const o = ${JSON.stringify(opts)};
    window.alert = function (m) { window.__freeAlert = String(m); };
    const set = (name, v) => {
      const list = document.querySelectorAll('[name="' + name + '"]');
      let n = 0;
      list.forEach((el) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); n += 1; });
      return n;
    };
    const miss = [];
    set('roomApplyTimeType', '1');            // 先切「按时刻」，否则后面切换会把时间框重置回 00:00
    [['classroom.type.id', o.type], ['classroom.campus.id', o.campus], ['classroom.building.id', o.building],
     ['seats', o.seats], ['classroom.name', o.name], ['cycleTime.cycleCount', '1'],
     ['cycleTime.dateBegin', o.date], ['cycleTime.dateEnd', o.date]].forEach(([k, v]) => {
      if (v != null && v !== '' && !set(k, String(v))) miss.push(k);
    });
    if (o.from) set('timeBegin', o.from);
    if (o.to) set('timeEnd', o.to);
    const st = ['classroom.campus.id','cycleTime.dateBegin','cycleTime.dateEnd','timeBegin','timeEnd'].map((n) => {
      const el = document.querySelector('[name="' + n + '"]'); return n + '=' + (!el ? 'MISSING' : el.value);
    });
    if (!${click}) return { how: 'fill', state: st, miss };
    const btn = Array.from(document.querySelectorAll('input[type=button],input[type=submit],button'))
      .find((b) => /查询/.test(String(b.value || b.textContent || '')));
    if (btn) { btn.click(); return { how: 'btn', state: st, miss }; }
    return { how: 'none', state: st, miss };
  })()`, true);
}

/* 打开应用内的空闲教室页，并把条件预填好，用户点页面上的「查询」 */
async function openFreeFilters(opts = {}) {
  const w = openEntryWindow(FREE_INDEX, '空闲教室查询');
  let filledOnce = false;
  const timer = setInterval(async () => {
    try {
      if (filledOnce) { clearInterval(timer); return; }
      const u = w.webContents.getURL();
      if (!/std-activity|free!index/i.test(u)) { console.log('FREE_PREFILL_WAIT ' + u); return; }
      const hasForm = await w.webContents.executeJavaScript('!!(document && document.actionForm)', true).catch(() => false);
      if (!hasForm) { console.log('FREE_PREFILL_NOFORM ' + u); return; }
      filledOnce = true;
      clearInterval(timer);
      const r = await fillFreeForm(w, opts, false);
      console.log('FREE_PREFILL ' + JSON.stringify(r));
      w.webContents.executeJavaScript("document.querySelector('[name=\"cycleTime.dateBegin\"]') && window.scrollTo(0,0)", true).catch(() => {});
    } catch (e) { console.log('FREE_PREFILL_ERR ' + ((e && e.message) || e)); }
  }, 700);
  setTimeout(() => clearInterval(timer), 60000);
  return { ok: true, opened: true };
}

async function freeQuery(opts = {}) {
  const w = freeWindow();const loginRe = /loginExt|login\.action|\/cas|uia\.hpu\.edu\.cn/i;
  const isLogin = (u) => loginRe.test(u || '');
  try {
    const cur = w.webContents.getURL();
    if (!cur || !/std-activity|free!index/i.test(cur)) {
      // 先走一遍统一认证拿 eams 会话，再进空闲教室页（直连需要会话，否则 302 到 loginExt）
      if (!/zhjw/i.test(cur)) {
        w.loadURL(CAS_LOGIN).catch(() => {});
        await waitLoad(w);
        await new Promise((r) => setTimeout(r, 1200));
      }
      w.loadURL(FREE_INDEX).catch(() => {});
      await waitLoad(w);
    }
    if (isLogin(w.webContents.getURL())) return { ok: false, needLogin: true, url: w.webContents.getURL() };
    // 表单可能比 did-finish-load 慢一步，先等 actionForm 出现
    let ready = false;
    for (let i = 0; i < 25; i += 1) {
      ready = await w.webContents.executeJavaScript('!!(document && document.actionForm)', true).catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!ready) return { ok: false, reason: '页面没加载出查询表单，请重试' };
    // 记录本次 POST 的实际参数（调试用，便于核对页面是否真的把条件发出去了）
    try {
      w.webContents.session.webRequest.onBeforeRequest({ urls: ['*://zhjw.hpu.edu.cn/eams/classroom/apply/free!search.action*'] }, (d, cb) => {
        const raw = d.uploadData && d.uploadData[0] && d.uploadData[0].bytes ? d.uploadData[0].bytes.toString('utf8').slice(0, 700) : '';
        console.log('FREE_POST ' + raw);
        cb({});
      });
    } catch (e) { /* 忽略 */ }
    const filled = await w.webContents.executeJavaScript(`(() => {
      window.alert = function (m) { window.__freeAlert = String(m); };
      const set = (name, v) => {
        const list = document.querySelectorAll('[name="' + name + '"]');
        let n = 0;
        list.forEach((el) => { el.value = v; el.dispatchEvent(new Event('change', { bubbles: true })); n += 1; });
        return n;
      };
      const o = ${JSON.stringify(opts)};
      const miss = [];
      set('roomApplyTimeType', '1');           // 先切「按时刻」，否则后续切换会重置时间框
      const need = { 'classroom.type.id': o.type || '', 'classroom.campus.id': o.campus || '', 'classroom.building.id': o.building || '',
        seats: o.seats || '', 'classroom.name': o.name || '', 'cycleTime.cycleCount': '1', 'cycleTime.dateBegin': o.date || '',
        'cycleTime.dateEnd': o.date || '' };
      Object.keys(need).forEach((k) => { if (!set(k, need[k])) miss.push(k); });
      set('timeBegin', o.from || '00:00');
      set('timeEnd', o.to || '00:00');
      const st = ['cycleTime.dateBegin','cycleTime.dateEnd','timeBegin','timeEnd','classroom.campus.id'].map((n) => {
        const el = document.querySelector('[name="' + n + '"]'); return n + '=' + (!el ? 'MISSING' : el.value);
      });
      const btn = Array.from(document.querySelectorAll('input[type=button],input[type=submit],button'))
        .find((b) => /查询/.test(String(b.value || b.textContent || '')));
      if (btn) { btn.click(); return { how: 'btn', state: st, miss }; }
      return { how: 'none', state: st, miss };
    })()`, true);
    console.log('FREE_FILL ' + JSON.stringify(filled));
    if (!filled || filled.how === 'none') return { ok: false, reason: '没找到查询按钮，页面结构可能变了' };
    // 结果表格在 iframe[name=freeRoomList] 里，轮询等它出数据
    let res = null;
    for (let i = 0; i < 20; i += 1) {
      await new Promise((r) => setTimeout(r, 400));
      res = await w.webContents.executeJavaScript(FREE_PARSE, true);
      if (res && res.rows && res.rows.length) break;
    }
    if (isLogin(w.webContents.getURL())) return { ok: false, needLogin: true, url: w.webContents.getURL() };
    const alertMsg = await w.webContents.executeJavaScript('window.__freeAlert || ""', true);
    console.log('FREE_NATIVE ' + JSON.stringify({ at: res && res.at, head: res && res.head, count: res && res.rows && res.rows.length, first: res && res.rows && res.rows[0], text: res && res.text, alert: alertMsg }));
    if (!res || !res.rows) return { ok: false, reason: '结果页没解析出表格' };
    if (!res.rows.length && alertMsg) return { ok: false, reason: alertMsg };
    return { ok: true, count: res.rows.length, rows: res.rows, at: res.at, date: opts.date, from: opts.from, to: opts.to };
  } catch (e) {
    return { ok: false, reason: '查询失败：' + ((e && e.message) || e) };
  }
}
ipcMain.handle('hpu:free', (_e, opts = {}) => freeQuery(opts));
ipcMain.handle('hpu:freeFilters', (_e, opts = {}) => openFreeFilters(opts));

/* ---------------- 空闲教室：登录后自动进页面，并把页面结构落到 debug/ ----------------
   页面必须登录（未登录 302 到 loginExt）。这里不替用户填表，只做两件事：
   1) 登录完落回教务首页时，自动跳到 publicFree!index.action；
   2) 到了查询页，把控件/选项/结果表结构写给开发者看，用来决定能不能做原生表格。 */
const FREE_URL = 'https://zhjw.hpu.edu.cn/eams/classroom/apply/free!index.action.action';
const FREE_DUMP_FORM = `(() => {
  const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
  const near = (el) => {
    const box = el.closest('td,tr,div,li,label,p');
    return t(box ? (box.innerText || '') : '').slice(0, 40);
  };
  const ctrls = Array.from(document.querySelectorAll('select,input,textarea')).map((el) => ({
    tag: el.tagName.toLowerCase(), type: el.type || '', name: el.name || '', id: el.id || '',
    label: near(el), value: String(el.value == null ? '' : el.value).slice(0, 30),
    opts: el.tagName === 'SELECT' ? Array.from(el.options).slice(0, 40).map((o) => ({ v: o.value, t: t(o.textContent).slice(0, 24) })) : undefined
  })).slice(0, 80);
  const btns = Array.from(document.querySelectorAll('input[type=button],input[type=submit],button,a'))
    .map((b) => ({ t: t(b.value || b.textContent).slice(0, 20), id: b.id || '', onclick: (b.getAttribute('onclick') || '').slice(0, 120), h: (b.getAttribute('href') || '').slice(0, 80) }))
    .filter((b) => /查询|检索|搜索|search/i.test(b.t + b.onclick + b.h)).slice(0, 12);
  return { url: location.href, title: document.title, ctrls, btns, text: t(document.body.innerText).slice(0, 700) };
})()`;

function watchFreePage(w) {
  const dir = path.join(__dirname, 'debug');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const save = (name, obj) => {
    try { fs.writeFileSync(path.join(dir, name), JSON.stringify(obj, null, 2), 'utf8'); } catch (e) { /* 忽略 */ }
  };
  let dumping = false;
  w.webContents.on('did-finish-load', async () => {
    const u = w.webContents.getURL();
    try {
      if (/loginExt|login\.action|\/cas|uia\.hpu\.edu\.cn/i.test(u) && !/ticket=/.test(u)) {
        console.log('FREE_LIVE_LOGIN ' + u);
        return;
      }
      if (!/publicFree/i.test(u) || dumping) return;
      dumping = true;
      await new Promise((r) => setTimeout(r, 1000));
      const form = await w.webContents.executeJavaScript(FREE_DUMP_FORM, true);
      save('free-live-form.json', form);
      console.log('FREE_LIVE_FORM ' + JSON.stringify(form).slice(0, 1200));
      const clicked = await w.webContents.executeJavaScript(`(() => {
        const els = Array.from(document.querySelectorAll('input[type=button],input[type=submit],button,a'));
        const hit = els.find((e) => /查询|检索|搜索/.test(String(e.value || e.textContent || '')));
        if (!hit) return false;
        hit.click(); return true;
      })()`, true);
      if (clicked) {
        await new Promise((r) => setTimeout(r, 3500));
        const res = await w.webContents.executeJavaScript(`(() => {
          const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
          const tables = Array.from(document.querySelectorAll('table'))
            .map((tb) => ({ rows: Array.from(tb.rows).length,
              head: Array.from(tb.rows).slice(0, 3).map((r) => Array.from(r.cells).map((c) => t(c.innerText).slice(0, 22))),
              sample: Array.from(tb.rows).slice(3, 9).map((r) => Array.from(r.cells).map((c) => t(c.innerText).slice(0, 22)) }))
            .filter((x) => x.rows > 1);
          return { at: location.href, tables, text: t(document.body.innerText).slice(0, 900) };
        })()`, true);
        save('free-live-result.json', { form, res });
        console.log('FREE_LIVE_RESULT ' + JSON.stringify(res).slice(0, 2000));
      }
         else console.log('FREE_LIVE_NOBTN');
    } catch (e) {
      console.log('FREE_LIVE_ERR ' + String((e && e.message) || e));
    }
  });
  // 登录完回到教务首页时，自动跳到空闲教室页
  w.webContents.on('did-navigate', (_e, u) => {
    if (/zhjw\.hpu\.edu\.cn\/eams\/(homeExt|login\.action|index\.action)/i.test(u) && !/publicFree/i.test(u)) {
      setTimeout(() => { if (!w.isDestroyed()) w.loadURL(FREE_URL); }, 1600);
    }
  });
}

/* ---------------- 宿舍水电读数（sdcx.hpu.edu.cn，免登录的表页） ----------------
   页面是 ASP.NET 三级联动：楼栋 → 楼层/单元 → 房间 → 点查询出记录。
   已在真实站点验证：不选全三项直接点查询会提示「请选择房间」，
   选好后表格里是「日期 / 房间名称 / 用量(度) / 单价」或「充值电量 / 金额 / 充值人」。
   每次调用都从头跑一遍三级联动（服务端靠 __VIEWSTATE + cookie session）。 */
const SDCX_PART = 'persist:hpu-sdcx';   // 与教务会话分开，互不干扰

function sdcxRequest(method, body) {
  return new Promise((resolve) => {
    const req = net.request({ method, url: 'https://sdcx.hpu.edu.cn/', session: session.fromPartition(SDCX_PART) });
    req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
    req.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36');
    let html = '';
    req.on('response', (res) => {
      res.on('data', (c) => { html += c.toString('utf8'); });
      res.on('end', () => resolve(html));
    });
    req.on('error', () => resolve(''));
    if (body) req.write(body);
    req.end();
  });
}

const SDX_PICK = (html, re) => ((html || '').match(re) || [])[1] || '';
function sdcxOptions(html, selectId) {
  const seg = (html.split(`id="${selectId}"`)[1] || '').split('</select>')[0];
  const out = [];
  const re = /<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g;
  let m;
  while ((m = re.exec(seg))) { if (m[1]) out.push({ code: m[1], name: m[2].trim() }); }
  return out;
}
function sdcxRows(html) {
  const seg = (html.split('class="dataTable"')[1] || '').split('</table>')[0];
  const rows = [];
  const trs = seg.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || [];
  trs.forEach((tr) => {
    if (/titleLine/.test(tr)) return;
    const cells = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
    if (cells.length >= 3) rows.push(cells);
  });
  return rows;
}

async function sdcxFetch({ building, floor, room, kind }) {
  const vs = (html) => SDX_PICK(html, /id="__VIEWSTATE" value="([^"]*)"/);
  const vsg = (html) => SDX_PICK(html, /id="__VIEWSTATEGENERATOR" value="([^"]*)"/);
  const form = (obj) => Object.keys(obj).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k] ?? '')).join('&');
  const radio = kind === 'buy' ? 'buyR' : 'usedR';

  const page0 = await sdcxRequest('GET');
  if (!page0) return { ok: false, reason: '读数站打不开（sdcx.hpu.edu.cn 无响应）' };

  // 1) 选楼栋（拿楼层/单元）
  const page1 = await sdcxRequest('POST', form({
    __EVENTTARGET: 'drlouming', __EVENTARGUMENT: '', __LASTFOCUS: '',
    __VIEWSTATE: vs(page0), __VIEWSTATEGENERATOR: vsg(page0),
    drlouming: building || '', drceng: '', drfangjian: '', radio,
  }));
  const floors = sdcxOptions(page1, 'drceng');
  if (!building) return { ok: true, buildings: sdcxOptions(page0, 'drlouming'), floors: [], rooms: [], rows: [] };
  if (!floor) return { ok: true, floors, rooms: [], rows: [] };

  // 2) 选楼层/单元（拿房间）
  const page2 = await sdcxRequest('POST', form({
    __EVENTTARGET: 'drceng', __EVENTARGUMENT: '', __LASTFOCUS: '',
    __VIEWSTATE: vs(page1), __VIEWSTATEGENERATOR: vsg(page1),
    drlouming: building, drceng: floor, drfangjian: '', radio,
  }));
  const rooms = sdcxOptions(page2, 'drfangjian');
  if (!room) return { ok: true, floors, rooms, rows: [] };

  // 3) 点查询（ImageButton1 是图片按钮，要带 .x/.y）
  const page3 = await sdcxRequest('POST', form({
    __EVENTTARGET: '', __EVENTARGUMENT: '', __LASTFOCUS: '',
    __VIEWSTATE: vs(page2), __VIEWSTATEGENERATOR: vsg(page2),
    drlouming: building, drceng: floor, drfangjian: room, radio,
    'ImageButton1.x': '12', 'ImageButton1.y': '8',
  }));
  const alert = SDX_PICK(page3, /alert\('([^']*)'\)/);
  return {
    ok: true, floors, rooms,
    rows: sdcxRows(page3),
    pages: SDX_PICK(page3, /共\s*(\d+)\s*页/),
    alert: alert || '',
    url: 'https://sdcx.hpu.edu.cn/',
  };
}

ipcMain.handle('hpu:sdcx', (_e, opts) => sdcxFetch(opts || {}));

/* ---------------- 宿舍电费查询（183.169.255.4:8080，免登录 ASP.NET 三级联动） ----------------
   实测：Default.aspx 选楼栋→楼层→房间，点查询后 302 到 /usedRecord.aspx（用电）或 /buyRecord.aspx（购电）。
   结果页横幅 h6 里是两块「XX剩余电量：xx 度」，表格是日期/电表/用量/单价（购电页为充值电量/金额/充值人）。
   不登录、不碰支付；每次调用从头跑一遍联动（服务端靠 __VIEWSTATE + session cookie）。 */
const ELEC_BASE = 'http://183.169.255.4:8080';

// 手动维护 cookie：net.request 分区 cookie 存储在 302 换会话时不可靠，这里自己解析 Set-Cookie 并在后续请求带上
function newElecJar() {
  const m = new Map();
  return {
    set(str) {
      const first = String(str).split(';')[0];
      const i = first.indexOf('=');
      if (i > 0) m.set(first.slice(0, i).trim(), first.slice(i + 1).trim());
    },
    header() { return [...m].map(([k, v]) => k + '=' + v).join('; '); },
  };
}

const http = require('http');

function elecRequest(method, path, body, jar) {
  return new Promise((resolve) => {
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
    };
    const cookie = jar && jar.header();
    if (cookie) headers.Cookie = cookie;
    const req = http.request({ host: '183.169.255.4', port: 8080, path, method, headers }, (res) => {
      let location = res.headers.location || '';
      const sc = res.headers['set-cookie'];
      if (sc) (Array.isArray(sc) ? sc : [sc]).forEach((c) => jar && jar.set(c));
      const chunks = [];
      res.on('data', (c) => { chunks.push(c); });
      res.on('end', () => {
        // 站点编码不统一：Default.aspx 表单页实际是 GBK，记录页 usedRecord/buyRecord 是 UTF-8。
        // 先按 UTF-8 严格解码，失败（出现非法字节）再回退 GBK。
        const buf = Buffer.concat(chunks);
        let html;
        try { html = new TextDecoder('utf-8', { fatal: true }).decode(buf); }
        catch { html = new TextDecoder('gbk').decode(buf); }
        resolve({ html, location, status: res.statusCode });
      });
    });
    req.on('error', (err) => resolve({ html: '', location: '', status: 0, err: String((err && err.message) || err) }));
    if (body) req.write(body);
    req.end();
  });
}

function elecBalances(html) {
  const out = [];
  const re = /([^<>：;]{1,30})剩余电量：<span class="number orange">([\d.]+)<\/span>/g;
  let m;
  while ((m = re.exec(html))) {
    let meter = m[1].trim().replace(/^[^一-龥A-Za-z0-9#]+/, '');
    out.push({ meter, kwh: parseFloat(m[2]) || 0 });
  }
  return out;
}

function elecEv(html) { return (html.match(/id="__EVENTVALIDATION" value="([^"]*)"/) || [])[1] || ''; }

// 照明/空调配对：按去掉「照明/空调」后缀后的楼栋名找同名另一套
function elecPair(buildings, code) {
  const cur = buildings.find((b) => b.code === code);
  if (!cur) return null;
  const base = cur.name.replace(/(照明|空调)/, '');
  return buildings.find((b) => b.code !== code && b.name.replace(/(照明|空调)/, '') === base && /照明|空调/.test(b.name)) || null;
}

const elecFmtDate = (d) => {
  const t = new Date(d);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

// 跑一遍三级联动 + 记录页；带日期范围时在记录页 POST btnser 过滤
async function elecChain({ building, floor, room, radio, start, end }, jar) {
  const vs = (h) => (h.match(/id="__VIEWSTATE" value="([^"]*)"/) || [])[1] || '';
  const form = (obj) => Object.keys(obj).map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(obj[k] ?? '')).join('&');

  const p0 = await elecRequest('GET', '/Default.aspx', null, jar);
  if (!p0.html) return { ok: false, reason: '电费查询站打不开（183.169.255.4:8080 无响应）' };

  const buildings = sdcxOptions(p0.html, 'drlouming');
  const p1 = await elecRequest('POST', '/Default.aspx', form({
    __EVENTTARGET: 'drlouming', __EVENTARGUMENT: '', __VIEWSTATE: vs(p0.html),
    drlouming: building || '', drceng: '', drfangjian: '', radio,
  }), jar);
  const floors = sdcxOptions(p1.html, 'drceng');
  if (!building) return { ok: true, buildings, floors: [], rooms: [], balances: [], rows: [] };
  if (!floor) return { ok: true, buildings, floors, rooms: [], balances: [], rows: [] };

  const p2 = await elecRequest('POST', '/Default.aspx', form({
    __EVENTTARGET: 'drceng', __EVENTARGUMENT: '', __VIEWSTATE: vs(p1.html),
    drlouming: building, drceng: floor, drfangjian: '', radio,
  }), jar);
  const rooms = sdcxOptions(p2.html, 'drfangjian');
  if (!room) return { ok: true, buildings, floors, rooms, balances: [], rows: [] };

  const p3 = await elecRequest('POST', '/Default.aspx', form({
    __EVENTTARGET: '', __EVENTARGUMENT: '', __VIEWSTATE: vs(p2.html),
    drlouming: building, drceng: floor, drfangjian: room, radio,
    'ImageButton1.x': '12', 'ImageButton1.y': '8',
  }), jar);
  const alert = (p3.html.match(/alert\('([^']*)'\)/) || [])[1] || '';
  let resHtml = p3.html;
  let locPath = '/usedRecord.aspx';
  if (p3.location) {
    locPath = p3.location.startsWith('/') ? p3.location : '/' + p3.location;
    const p4 = await elecRequest('GET', locPath, null, jar);
    resHtml = p4.html || p3.html;
  }
  // 记录页日期筛选：带 VIEWSTATE / EVENTVALIDATION 提交 btnser
  if (start && end && resHtml) {
    const p5 = await elecRequest('POST', locPath, form({
      __EVENTTARGET: '', __EVENTARGUMENT: '',
      __VIEWSTATE: vs(resHtml), __EVENTVALIDATION: elecEv(resHtml),
      txtstart: start, txtend: end, btnser: '查询',
    }), jar);
    if (p5.html) resHtml = p5.html;
  }
  return { ok: true, buildings, floors, rooms, balances: elecBalances(resHtml), rows: sdcxRows(resHtml), alert, resHtml };
}

async function elecFetch(opts) {
  const radio = opts.kind === 'buy' ? 'buyR' : 'usedR';
  const end = opts.end || elecFmtDate(new Date());
  const start = opts.start || elecFmtDate(Date.now() - 30 * 86400000);

  const primary = await elecChain({
    building: opts.building || '', floor: opts.floor || '', room: opts.room || '',
    radio, start, end,
  }, newElecJar());
  if (!primary.ok) return primary;

  const out = {
    ok: true, buildings: primary.buildings, floors: primary.floors, rooms: primary.rooms,
    balances: primary.balances, rows: primary.rows, alert: primary.alert,
    url: ELEC_BASE + '/Default.aspx',
  };

  // 选到房间后，自动配对另一套（照明↔空调）同楼层同房号再查一遍余额
  if (opts.room && opts.building) {
    const twin = elecPair(primary.buildings, opts.building);
    if (twin) {
      const pairFloor = twin.code + (opts.floor || '').slice(2);
      const pairRoom = twin.code + (opts.room || '').slice(2);
      const pair = await elecChain({
        building: twin.code, floor: pairFloor, room: pairRoom,
        radio, start, end,
      }, newElecJar());
      if (pair.ok) {
        out.balances = out.balances.concat(pair.balances);
        out.pair = { code: twin.code, name: twin.name, balances: pair.balances, rows: pair.rows };
      }
    }
  }
  return out;
}

ipcMain.handle('hpu:elec', (_e, opts) => elecFetch(opts || {}));

/* ---------------- 会话管理 ---------------- */
ipcMain.handle('hpu:session', async () => {
  const s = sharedSession();
  const cookies = await s.cookies.get({ domain: 'hpu.edu.cn' });
  const names = cookies.map((c) => c.name).filter((n) => /CASTGC|JSESSIONID|SESSION|UIA|route/i.test(n));
  return { logged: names.length > 0, hints: names.slice(0, 6) };
});

ipcMain.handle('hpu:clear', async () => {
  const s = sharedSession();
  await s.clearStorageData();
  await s.clearAuthCache();
  return { ok: true };
});

/* ---------------- 宿舍读数探针（不开窗口，直接跑一遍 sdcx 三级联动） ---------------- */
async function runSdcxProbe() {
  const arg = {};
  process.argv.filter(a => a.startsWith('--sdcx-arg=')).forEach((a) => {
    const s = a.replace('--sdcx-arg=', '');
    const i = s.indexOf(':');
    if (i > 0) arg[s.slice(0, i)] = s.slice(i + 1);
  });
  const building = arg.building || '04';
  const floor = arg.floor || '';
  const room = arg.room || '';
  const kind = arg.kind || 'used';
  try {
    const res = await sdcxFetch({ building, floor, room, kind });
    console.log('SDCX_PROBE ' + JSON.stringify({
      ok: res.ok, reason: res.reason || '',
      floors: (res.floors || []).slice(0, 6),
      rooms: (res.rooms || []).slice(0, 6),
      roomCount: (res.rooms || []).length,
      rows: (res.rows || []).slice(0, 8),
      rowCount: (res.rows || []).length,
      pages: res.pages, alert: res.alert,
    }));
  } catch (e) {
    console.log('SDCX_PROBE_ERR ' + String((e && e.message) || e));
  }
  app.quit();
}

/* ---------------- 电费站探针：不开窗口，跑一遍 elecFetch 三级联动 ---------------- */
async function runElecProbe() {
  const arg = {};
  process.argv.filter(a => a.startsWith('--elec-arg=')).forEach((a) => {
    const s = a.replace('--elec-arg=', '');
    const i = s.indexOf(':');
    if (i > 0) arg[s.slice(0, i)] = s.slice(i + 1);
  });
  try {
    const res = await elecFetch({ building: arg.building || '', floor: arg.floor || '', room: arg.room || '', kind: arg.kind || 'used' });
    console.log('ELEC_PROBE ' + JSON.stringify({
      ok: res.ok, reason: res.reason || '',
      buildings: (res.buildings || []).slice(0, 8),
      floors: (res.floors || []).slice(0, 6),
      rooms: (res.rooms || []).slice(0, 6),
      balances: res.balances,
      pair: res.pair && { name: res.pair.name, balances: res.pair.balances, rowCount: (res.pair.rows || []).length },
      rows: (res.rows || []).slice(0, 8),
      rowCount: (res.rows || []).length, alert: res.alert,
    }));
  } catch (e) {
    console.log('ELEC_PROBE_ERR ' + String((e && e.message) || e));
  }
  app.quit();
}

/* ---------------- 微后勤 whgfwdt 探针：不开窗口，看 SPA 未登录渲染什么、接口状态 ---------------- */
async function runWhgfwProbe() {
  const win = new BrowserWindow({
    width: 430, height: 900, show: false,
    webPreferences: { partition: 'persist:hpu-whgfw', contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  // 学校该站证书已过期（ERR_CERT_DATE_INVALID），探针里放行
  win.webContents.session.setCertificateVerifyProc((_req, cb) => cb(0));
  const wxUa = process.argv.includes('--whgfw-mimic-wx');
  if (wxUa) win.webContents.session.setUserAgent(
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36 MicroMessenger/8.0.49.2600(0x2800313B) NetType/WIFI Language/zh_CN');
  const route = (process.argv.find(a => a.startsWith('--whgfw-route=')) || '').replace('--whgfw-route=', '') || '/home/index';
  try {
    await win.loadURL('https://whgfwdt.hpu.edu.cn/hnlg/index.html#' + route);
    await sleep(3800);
    const info = await win.webContents.executeJavaScript(`(async () => {
      const fetchSt = async (u, m) => {
        try {
          const r = await fetch(u, { method: m || 'GET', credentials: 'include',
            headers: { 'Content-Type': 'application/json;charset=utf-8' }, body: m === 'POST' ? '{}' : undefined });
          return { status: r.status, head: (await r.text()).slice(0, 180) };
        } catch (e) { return { status: 0, head: String((e && e.message) || e) }; }
      };
      const ls = {};
      try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls[k] = (localStorage.getItem(k) || '').slice(0, 80); } } catch (e) {}
      return {
        url: location.href, title: document.title,
        text: (document.body.innerText || '').slice(0, 1400),
        ls,
        imgs: [...document.querySelectorAll('img,canvas,iframe')].map(i => i.src || '').slice(0, 10),
        links: [...document.querySelectorAll('a')].map(a => a.href).slice(0, 12),
        authz: await fetchSt('/fapi/index/getAuthz', 'GET'),
        user: await fetchSt('/fapi/index/getUserInfo', 'GET'),
        home: await fetchSt('/fapi/index/home', 'GET'),
        entries: await fetchSt('/fapi/index/headerEntries', 'GET'),
      };
    })()`);
    console.log('WHGFW_PROBE ' + JSON.stringify(info));
    try {
      const dir = path.join(__dirname, 'debug');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML', true);
      fs.writeFileSync(path.join(dir, 'whgfw-probe.html'), html, 'utf8');
    } catch (e) { /* 忽略 */ }
  } catch (e) {
    console.log('WHGFW_PROBE_ERR ' + String((e && e.message) || e));
  }
  app.quit();
}

/* UI 探针：开原型截图各屏，验证版式/主题/首页成绩入口 */
function runUiProbe() {
  const fresh = process.argv.includes('--fresh-probe');
  const win = new BrowserWindow({
    width: 460, height: 1180, x: -1500, y: 60, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false,
      partition: fresh ? 'ephemeral:fresh-probe' : undefined
    },
  });
  const dir = path.join(__dirname, 'debug');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shot = async (n) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(dir, 'ui-' + n + '.png'), img.toPNG());
    console.log('UI_SHOT ' + n);
  };
  win.webContents.on('console-message', (_e, _lvl, msg) => console.log('UI_CONSOLE ' + String(msg).slice(0, 300)));
  win.webContents.on('did-finish-load', async () => {
    await sleep(1400);
    win.showInactive();   // 隐藏窗口会停止出帧，截图会是旧画面；这里放到屏幕外再显示
    try {
      const st = await win.webContents.executeJavaScript(`(() => {
        const n = (id) => (document.getElementById(id) || {}).innerHTML;
        return { day: document.querySelectorAll('#homeDayList .hdrow').length,
          gradeLen: (n('homeGradeBody')||'').length, todoLen: (n('todoList')||'').length,
          powerLen: (n('homePowerBody')||'').length, meta: (document.getElementById('homeDayMeta')||{}).textContent,
          hasParse: !!(window.__campusParse),
          demo: !!(window.__campusParse && window.__campusParse.state().demo),
          courseCount: Object.keys((window.__campusParse && window.__campusParse.state().courses) || {}).length,
          sheetOn: document.querySelector('#sheet').classList.contains('on'),
          sheetTitle: (document.querySelector('#sheetBody h3') || {}).textContent,
          freeBtns: ['erLogin', 'erOpen'].map(id => !!document.getElementById(id)),
          freeTitle: Array.from(document.querySelectorAll('#s-timetable h2')).map(h => h.textContent).join('/') };
      })()`, true);
      console.log('UI_DOM ' + JSON.stringify(st));
      console.log('UI_MOBILE ' + JSON.stringify({
        cas: MOBILE_HOST_RE.test(CAS_LOGIN),
        seat: MOBILE_HOST_RE.test('https://seatlib.hpu.edu.cn/libseat/#/login'),
        freeDesktop: DESKTOP_HOST_RE.test('https://zhjw.hpu.edu.cn/eams/publicFree!index.action'),
        utility: MOBILE_HOST_RE.test('http://183.169.255.4:8080/Default.aspx')
      }));
      await shot('home-top');
      await win.webContents.executeJavaScript('document.querySelector("#s-home").scrollTop=9999', true);
      await sleep(500); await shot('home-bottom');
      for (const t of ['timetable', 'power', 'library', 'campus']) {
        await win.webContents.executeJavaScript(`document.querySelector('.tab[data-tab="${t}"]').click()`, true);
        await sleep(650); await shot(t);
        if (t === 'timetable') {
          await win.webContents.executeJavaScript('document.querySelector("#s-timetable").scrollTop=9999', true);
          await sleep(400); await shot('timetable-bottom');
        }
        if (t === 'campus') {
          await win.webContents.executeJavaScript("document.querySelector('#sheet').classList.remove('on'); document.querySelector('#mask').classList.remove('on')", true);
          await sleep(300);
          await win.webContents.executeJavaScript('document.querySelector("#s-campus").scrollTop=9999', true);
          await sleep(400); await shot('campus-bottom');
          const menus = await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('#s-campus .menu[data-link]')).map(el => ({ k: el.dataset.link, t: el.querySelector('.l').textContent.trim() }))`, true);
          console.log('UI_MENUS ' + JSON.stringify(menus));
          await win.webContents.executeJavaScript('document.querySelector("#s-campus").scrollTop=0', true);
          await sleep(300);
          await win.webContents.executeJavaScript('document.querySelector("#themeSwatches button[data-theme=green]").click()', true);
          await sleep(600); await shot('theme-green');
          await win.webContents.executeJavaScript('document.querySelector("#themeSwatches button[data-theme=ink]").click()', true);
          await sleep(400);
        }
      }
      // 首页点成绩卡 → 成绩页 → 返回
      await win.webContents.executeJavaScript('document.querySelector(".tab[data-tab=home]").click()', true);
      await sleep(500);
      await win.webContents.executeJavaScript('document.querySelector("#homeGradeCard").click()', true);
      const afterClick = await win.webContents.executeJavaScript('[document.querySelector(".screen.active").id, document.getElementById("pageTitle").textContent]', true);
      console.log('UI_AFTER_CLICK ' + JSON.stringify(afterClick));
      await sleep(700); await shot('grades');
      await win.webContents.executeJavaScript('document.querySelector("#gradesBack").click()', true);
      await sleep(500);
      const back = await win.webContents.executeJavaScript('document.querySelector(".screen.active").id', true);
      const theme = await win.webContents.executeJavaScript('document.documentElement.getAttribute("data-theme")', true);
      console.log('UI_STATE ' + JSON.stringify({ back, theme }));
    } catch (e) {
      console.log('UI_PROBE_FAIL ' + String((e && e.message) || e));
    }
    app.exit(0);
  });
  win.loadFile(PROTO);
}

/* 空闲教室探针：用已保存的教务会话打开首页，找出「公共服务 → 空闲教室」的入口与表单字段 */
function runFreeProbe() {
  const win = new BrowserWindow({
    width: 1280, height: 900, show: false,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const dump = async (tag) => {
    const r = await win.webContents.executeJavaScript(`(() => {
      const txt = (el) => (el.textContent || '').replace(/\\s+/g, ' ').trim();
      const links = Array.from(document.querySelectorAll('a,li,div'))
        .map(el => ({ t: txt(el).slice(0, 40), h: el.getAttribute('href') || (el.querySelector('a') ? el.querySelector('a').getAttribute('href') : '') || '' }))
        .filter(x => /空闲|空教室|教室查询|classroom|public\\//i.test(x.t + ' ' + x.h))
        .slice(0, 40);
      const forms = Array.from(document.querySelectorAll('form')).map(f => ({
        action: f.getAttribute('action') || '', method: f.getAttribute('method') || '',
        fields: Array.from(f.querySelectorAll('input,select')).map(i => ({ n: i.name || i.id, t: i.type || i.tagName, v: i.value && i.value.slice ? i.value.slice(0, 40) : i.value })).slice(0, 30)
      })).slice(0, 8);
      const sels = Array.from(document.querySelectorAll('select')).map(s => ({ n: s.name || s.id, o: Array.from(s.options).map(o => o.value + ':' + (o.textContent || '').trim().slice(0, 16)).slice(0, 12) })).slice(0, 10);
      return { url: location.href, title: document.title, needLogin: /login|cas|统一身份认证/.test(location.href + document.title),
        links, forms, sels, body: (document.body.innerText || '').slice(0, 1200) };
    })()`, true);
    console.log(tag + ' ' + JSON.stringify(r));
    return r;
  };
  win.webContents.on('did-finish-load', async () => {
    await sleep(3500);
    try {
      const home = await dump('FREE_HOME');
      const hit = (home.links || []).find(x => /空闲|空教室|教室查询|classroom/i.test(x.t + ' ' + x.h) && x.h);
      const argUrl = (process.argv.find(a => a.startsWith('--free-url=')) || '').replace('--free-url=', '');
      const target = argUrl || (hit && hit.h ? new URL(hit.h, 'https://zhjw.hpu.edu.cn').href : '');
      if (target) {
        console.log('FREE_TARGET ' + target);
        await win.loadURL(target);
        await sleep(3000);
        await dump('FREE_PAGE');
        const dir = path.join(__dirname, 'debug');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML', true);
        fs.writeFileSync(path.join(dir, 'free-page.html'), html, 'utf8');
        console.log('FREE_FILE ' + path.join(dir, 'free-page.html'));
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(dir, 'free-page.png'), img.toPNG());
      } else {
        console.log('FREE_NOHIT');
      }
    } catch (e) {
      console.log('FREE_ERR ' + String((e && e.message) || e));
    }
    app.exit(0);
  });
  win.loadURL(HOME_URL);
}

/* 空闲教室入口探针：真点一次「打开空闲教室查询」，看子窗口落到哪（应为登录页或查询页） */
async function runFreeOpenProbe() {
  createMain();
  await new Promise((r) => setTimeout(r, 2500));
  const url = 'https://zhjw.hpu.edu.cn/eams/publicFree!index.action';
  try {
    await mainWin.webContents.executeJavaScript(`window.hpu.openInApp(${JSON.stringify(url)}, '空闲教室查询')`, true);
    await new Promise((r) => setTimeout(r, 7000));
    const wins = BrowserWindow.getAllWindows().map((w) => ({ t: w.getTitle(), u: w.webContents.getURL(), b: w.getBounds() }));
    console.log('FREE_OPEN ' + JSON.stringify(wins));
    const child = BrowserWindow.getAllWindows().find((w) => w !== mainWin);
    if (child) {
      const found = await child.webContents.executeJavaScript('({ url: location.href, title: document.title, hasFreeForm: /空闲教室|教学楼|容量/.test(document.body.innerText) && !!document.querySelector("select") })', true);
      console.log('FREE_OPEN_PAGE ' + JSON.stringify(found));
      const img = await child.webContents.capturePage();
      fs.writeFileSync(path.join(__dirname, 'debug', 'free-open.png'), img.toPNG());
      console.log('FREE_OPEN_SHOT free-open.png');
    }
  } catch (e) {
    console.log('FREE_OPEN_ERR ' + String((e && e.message) || e));
  }
  app.exit(0);
}

/* 直接开空闲教室窗口（登录后自动进查询页并落盘结构），给「用户已登录」时手工验收用 */
async function openFreeNow() {
  createMain();
  await new Promise((r) => setTimeout(r, 1200));
  const w = openEntryWindow(FREE_URL, '空闲教室查询');
  watchFreePage(w);
  console.log('FREE_NOW opened ' + FREE_URL);
}

/* 统一入口探针：开一次教务入口，打印实际落点并截图（未登录应为 CAS 认证页） */
async function runEntryProbe() {
  const target = (process.argv.find((a) => a.startsWith('--entry-url=')) || '').replace('--entry-url=', '') || FREE_URL;
  const w = openChild(CAS_LOGIN, '统一身份认证 · 教务', { width: 1080, height: 800 });
  attachUnifiedEntry(w, 'page', target);
  await new Promise((r) => setTimeout(r, 9000));
  const info = await w.webContents.executeJavaScript('({ url: location.href, title: document.title, hasLogin: /登录|认证/.test(document.body.innerText), text: (document.body.innerText||"").replace(/\\s+/g," ").slice(0,200) })', true);
  console.log('ENTRY_PROBE ' + JSON.stringify(info));
  const img = await w.webContents.capturePage();
  fs.writeFileSync(path.join(__dirname, 'debug', 'entry-probe.png'), img.toPNG());
  console.log('ENTRY_PROBE_SHOT entry-probe.png');
  app.exit(0);
}

/* 首页菜单探针：登录态就绪后打开教务首页，列出「公共服务」分支里的空闲教室链接 */
async function runHomeProbe() {
  const w = openChild(CAS_LOGIN, '统一身份认证 · 教务', { width: 1080, height: 800 });
  attachUnifiedEntry(w, 'auth', '');
  await new Promise((r) => setTimeout(r, 11000));
  const info = await w.webContents.executeJavaScript(`(() => {
    const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const links = Array.from(document.querySelectorAll('a')).map((a) => ({ t: t(a.textContent).slice(0, 24), h: a.getAttribute('href') || '', oc: (a.getAttribute('onclick') || '').slice(0, 90), target: a.getAttribute('target') || '' }))
      .filter((x) => /空闲|教室|free/i.test(x.t + ' ' + x.h + ' ' + x.oc));
    const frames = Array.from(document.querySelectorAll('iframe,frame')).map((f) => f.getAttribute('src') || '');
    return { url: location.href, links, frames };
  })()`, true);
  console.log('HOME_LINKS ' + JSON.stringify(info).slice(0, 2500));
  app.exit(0);
}

/* 菜单路径探针：从教务首页点「公共服务 → 空闲教室查询」，看菜单打开的真实地址与帧结构 */
async function runFreeMenuProbe() {
  const w = freeWindow();
  w.loadURL(CAS_LOGIN).catch(() => {});
  await waitLoad(w);
  await new Promise((r) => setTimeout(r, 1500));
  const a1 = await w.webContents.executeJavaScript(`(() => {
    const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const links = Array.from(document.querySelectorAll('a')).filter((a) => /空闲教室/.test(t(a.textContent)));
    return { url: location.href, found: links.map((a) => ({ h: a.getAttribute('href'), oc: a.getAttribute('onclick') })) };
  })()`, true);
  console.log('MENU_A ' + JSON.stringify(a1));
  await w.webContents.executeJavaScript(`(() => { const a = Array.from(document.querySelectorAll('a')).find((x) => /空闲教室/.test(x.textContent)); if (a) a.click(); return !!a; })()`, true).catch(() => {});
  await new Promise((r) => setTimeout(r, 5000));
  const a2 = await w.webContents.executeJavaScript(`(() => {
    const frames = Array.from(document.querySelectorAll('iframe,frame')).map((f) => ({ name: f.name || '', id: f.id || '', src: f.getAttribute('src') || '', url: (f.contentWindow && f.contentWindow.location.href) || '' }));
    return { top: location.href, frames };
  })()`, true);
  console.log('MENU_B ' + JSON.stringify(a2).slice(0, 1200));
  app.exit(0);
}

/* 接口探针：在已登录页里直接 POST 查询接口，试不同参数组合，看哪种才真的过滤 */
async function runFreeApiProbe() {
  const w = freeWindow();
  w.loadURL(CAS_LOGIN).catch(() => {});
  await waitLoad(w);
  await new Promise((r) => setTimeout(r, 1200));
  w.loadURL(FREE_INDEX).catch(() => {});
  await waitLoad(w);
  await new Promise((r) => setTimeout(r, 1000));
  const out = await w.webContents.executeJavaScript(`(async () => {
    const base = { 'classroom.type.id': '', 'classroom.campus.id': '1', 'classroom.building.id': '', seats: '', 'classroom.name': '',
      'cycleTime.cycleCount': '1', 'cycleTime.cycleType': '1', 'roomApplyTimeType': '1' };
    const cases = [
      { tag: 'E-nozero', extra: { 'cycleTime.dateBegin': '2026-11-27', 'cycleTime.dateEnd': '2026-11-27', timeBegin: '8:00', timeEnd: '9:40' } },
      { tag: 'F-plain', extra: { dateBegin: '2026-11-27', dateEnd: '2026-11-27', timeBegin: '08:00', timeEnd: '09:40' } },
      { tag: 'G-sec', extra: { 'cycleTime.dateBegin': '2026-11-27', 'cycleTime.dateEnd': '2026-11-27', timeBegin: '1', timeEnd: '2', roomApplyTimeType: '0' } }
    ];
    const res = [];
    for (const c of cases) {
      const params = new URLSearchParams(Object.assign({}, base, c.extra));
      const r = await fetch('/eams/classroom/apply/free!search.action', { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'X-Requested-With': 'XMLHttpRequest' }, body: params.toString() });
      const html = await r.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const tb = Array.from(doc.querySelectorAll('table')).find((t) => { const h = t.rows[0] ? Array.from(t.rows[0].cells).map((x) => x.innerText.replace(/\\s+/g, '')) : []; return h.length >= 5 && h.some((x) => /名称/.test(x)) && h.some((x) => /容量/.test(x)); });
      const total = ((doc.body ? doc.body.innerText : '').match(/of (\\d+)/) || [])[1] || (tb ? tb.rows.length - 1 : 0);
      const firstRows = tb ? Array.from(tb.rows).slice(1, 3).map((rw) => Array.from(rw.cells).map((x) => x.innerText.trim()).join('|')) : [];
      res.push({ tag: c.tag, total, sample: firstRows });
      await new Promise((r2) => setTimeout(r2, 2500));
    }
    return res;
  })()`, true);
  console.log('FREE_API ' + JSON.stringify(out, null, 1).slice(0, 3000));
  app.exit(0);
}

/* 表单探针：看清查询表单结构和 searchFreeApply 的取参方式 */
async function runFreeFormProbe() {
  const w = freeWindow();
  w.loadURL(CAS_LOGIN).catch(() => {});
  await waitLoad(w);
  await new Promise((r) => setTimeout(r, 1200));
  w.loadURL(FREE_INDEX).catch(() => {});
  await waitLoad(w);
  await new Promise((r) => setTimeout(r, 1500));
  const info = await w.webContents.executeJavaScript(`(() => {
    const t = (s) => (s || '').replace(/\\s+/g, ' ').trim();
    const db = document.querySelector('[name="cycleTime.dateBegin"]');
    const form = db && db.form;
    const fn = typeof searchFreeApply === 'function' ? searchFreeApply.toString() : 'N/A';
    const inputs = Array.from(document.querySelectorAll('input,select')).map((el) => ({
      n: el.name || '', id: el.id || '', type: el.type || el.tagName.toLowerCase(),
      v: String(el.value || '').slice(0, 20), dis: el.disabled ? 1 : 0, ro: el.readOnly ? 1 : 0,
      vis: (el.offsetWidth > 0 || el.offsetHeight > 0) ? 1 : 0
    })).filter((x) => /date|Time|time|cycle|room|classroom|seat/.test(x.n + x.id)).slice(0, 40);
    const btns = Array.from(document.querySelectorAll('input[type=button],button,a,img')).map((b) => ({ t: t(b.value || b.textContent).slice(0, 16), tag: b.tagName.toLowerCase(), onclick: (b.getAttribute('onclick') || '').slice(0, 120), h: (b.getAttribute('href') || '').slice(0, 90) })).filter((b) => /查询|搜索/.test(b.t + b.onclick)).slice(0, 8);
    const fattr = form ? { action: form.action, method: form.method, target: form.target, name: form.name, enctype: form.enctype } : null;
    return { url: location.href, fn, inputs, formId: form ? (form.id || form.name || form.action) : 'NOFORM', fattr, btns, formHtml: form ? t(form.innerHTML).slice(0, 300) : '' };
  })()`, true);
  console.log('FREE_FORM ' + JSON.stringify(info));
  app.exit(0);
}

/* 原生空闲教室查询探针：直接跑一遍免费教室查询并打印结果 */
async function runFreeQueryProbe() {
  const d = new Date();
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const res = await freeQuery({ date, campus: '1', from: '08:00', to: '09:40' });
  console.log('FREE_QUERY_PROBE ' + JSON.stringify({ ok: res.ok, needLogin: res.needLogin, count: res.count, reason: res.reason, at: res.at, first: res.rows && res.rows.slice(0, 3) }));
  app.exit(0);
}

/* 预填探针：打开空闲教室页并预填条件，截图核对 */
async function runFreePrefillProbe() {
  await openFreeFilters({ campus: '1', date: '2026-11-27', from: '08:00', to: '09:40', seats: '', type: '', building: '' });
  await new Promise((r) => setTimeout(r, 14000));
  const wins = BrowserWindow.getAllWindows();
  const w = wins.find((x) => /空闲教室/.test(x.getTitle())) || wins[wins.length - 1];
  const url = w.webContents.getURL();
  const st = await w.webContents.executeJavaScript(`(() => {
    const v = (n) => { const el = document.querySelector('[name="' + n + '"]'); return el ? el.value : 'MISSING'; };
    return { campus: v('classroom.campus.id'), d1: v('cycleTime.dateBegin'), d2: v('cycleTime.dateEnd'), t1: v('timeBegin'), t2: v('timeEnd'), hasForm: !!document.actionForm };
  })()`, true).catch((e) => ({ err: String(e) }));
  console.log('FREE_PREFILL_PROBE ' + JSON.stringify({ url, st }));
  try {
    const img = await w.capturePage();
    const dir = path.join(__dirname, 'debug');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'free-prefill.png'), img.toPNG());
    console.log('FREE_PREFILL_SHOT ok');
  } catch (e) { console.log('FREE_PREFILL_SHOT fail ' + String(e)); }
  app.exit(0);
}

/* 天气探针：在渲染进程里跑一次 open-meteo 请求，看是否被拦 */
async function runWxProbe() {
  const w = new BrowserWindow({
    width: 460, height: 1180, x: -1500, y: 60, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  w.webContents.on('console-message', (_e, _lvl, msg) => console.log('WX_CONSOLE ' + String(msg).slice(0, 300)));
  w.loadFile(PROTO);
  await new Promise((r) => setTimeout(r, 5000));
  const out = await w.webContents.executeJavaScript(`(async () => {
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=35.2156&longitude=113.2404&current=temperature_2m,weather_code&timezone=Asia%2FShanghai';
    try {
      const r = await fetch(url, { cache: 'no-store' });
      const j = await r.json();
      const badge = document.getElementById('homeWeather');
      return { ok: true, status: r.status, temp: j && j.current && j.current.temperature_2m, code: j && j.current && j.current.weather_code,
        badgeHidden: badge ? badge.hidden : 'no-badge', badgeText: badge ? badge.innerText.replace(/\\s+/g, ' ').trim() : '' };
    } catch (e) { return { ok: false, err: String(e) }; }
  })()`, true).catch((e) => ({ evalErr: String(e) }));
  console.log('WX_PROBE ' + JSON.stringify(out));
  // 顺手切到默认墨绿铜主题截一张，确认天气徽章在默认主题下的观感
  await w.webContents.executeJavaScript("localStorage.setItem('campus_theme_v2','ink'); localStorage.removeItem('campus_weather_v1'); location.reload()", true).catch(() => {});
  await new Promise((r) => setTimeout(r, 6000));
  try {
    const img = await w.capturePage();
    const dir = path.join(__dirname, 'debug');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'wx-home-ink.png'), img.toPNG());
    console.log('WX_SHOT ok');
  } catch (e) { console.log('WX_SHOT fail ' + String(e)); }
  app.exit(0);
}

/* 面板探针：分别截「使用说明」和「制作不易」两张弹窗 */
async function runSheetProbe() {
  const w = new BrowserWindow({
    width: 460, height: 1180, x: -1500, y: 60, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  w.loadFile(PROTO);
  await new Promise((r) => setTimeout(r, 4200));
  w.showInactive();
  await new Promise((r) => setTimeout(r, 500));
  const open = async (id) => {
    await w.webContents.executeJavaScript(`document.getElementById('${id}').click()`, true).catch(() => {});
    await new Promise((r) => setTimeout(r, 700));
    const img = await w.capturePage();
    fs.writeFileSync(path.join(os.tmpdir(), `${id}-sheet.png`), img.toPNG());
    console.log('SHEET_SHOT ' + id);
    await w.webContents.executeJavaScript(`document.getElementById('mask').dispatchEvent(new Event('click'))`, true).catch(() => {});
    await new Promise((r) => setTimeout(r, 600));
  };
  await open('openHelp');
  await open('openThanks');
  app.exit(0);
}

/* 输入探针：真实点击 + 键入，检查个人资料面板能否输入 */
async function runTypeProbe() {
  const w = new BrowserWindow({
    width: 460, height: 1180, x: -1500, y: 60, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  w.loadFile(PROTO);
  await new Promise((r) => setTimeout(r, 4200));
  const geo = await w.webContents.executeJavaScript(`(() => {
    const el = document.getElementById('pfName');
    if (!el) return { err: 'no input' };
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const hit = document.elementFromPoint(cx, cy);
    return { rect: { x: r.left, y: r.top, w: r.width, h: r.height }, hit: hit ? (hit.tagName + '#' + (hit.id || '') + '.' + (hit.className || '')) : 'none',
      same: hit === el, disabled: el.disabled, readOnly: el.readOnly, value: el.value };
  })()`, true).catch((e) => ({ evalErr: String(e) }));
  console.log('TYPE_GEO ' + JSON.stringify(geo));
  if (geo && geo.rect) {
    const x = Math.round(geo.rect.x + geo.rect.w / 2);
    const y = Math.round(geo.rect.y + geo.rect.h / 2);
    w.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    w.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await new Promise((r) => setTimeout(r, 200));
    w.webContents.insertText('测试同学');
    await new Promise((r) => setTimeout(r, 300));
  }
  const post = await w.webContents.executeJavaScript(`(() => {
    const el = document.getElementById('pfName');
    return { value: el ? el.value : 'gone', focused: document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : 'none' };
  })()`, true).catch((e) => ({ evalErr: String(e) }));
  console.log('TYPE_RESULT ' + JSON.stringify(post));
  app.exit(0);
}

/* 资料探针：模拟填写学号/姓名/保存，核对问候语是否按时段 + 姓名渲染（截图写到临时目录） */
async function runProfileProbe() {
  console.log('PROFILE_START');
  const w = new BrowserWindow({
    width: 460, height: 1180, x: -1500, y: 60, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  w.webContents.on('console-message', (_e, _lvl, msg) => console.log('PF_CONSOLE ' + String(msg).slice(0, 200)));
  w.loadFile(PROTO);
  await new Promise((r) => setTimeout(r, 4500));
  const before = await w.webContents.executeJavaScript(`(() => ({ sheet: !!document.querySelector('#pfSave'), hello: document.getElementById('homeHello').textContent }))()`, true).catch((e) => ({ err: String(e) }));
  const tmp = os.tmpdir();
  try {
    w.showInactive();
    await new Promise((r) => setTimeout(r, 700));
    const img0 = await w.capturePage();
    fs.writeFileSync(path.join(tmp, 'profile-panel.png'), img0.toPNG());
    console.log('PROFILE_PANEL_SHOT ' + path.join(tmp, 'profile-panel.png'));
  } catch (e) { console.log('PROFILE_PANEL_SHOT fail ' + String(e)); }
  const saved = await w.webContents.executeJavaScript(`(() => {
    const sid = document.getElementById('pfSid'); const nm = document.getElementById('pfName'); const pw = document.getElementById('pfPwd');
    if (sid) sid.value = '000000000000';
    if (nm) nm.value = '测试同学';
    if (pw) pw.value = 'test123456';
    const btn = document.getElementById('pfSave');
    if (btn) btn.click();
    return { filled: !!(sid && nm && pw), saved: !!btn };
  })()`, true).catch((e) => ({ err: String(e) }));
  await new Promise((r) => setTimeout(r, 800));
  const after = await w.webContents.executeJavaScript(`(() => {
    const raw = localStorage.getItem('campus_cache_v1') || '';
    const sheet = document.getElementById('sheet');
    const head = document.querySelector('#sheetBody h3');
    return {
      hello: document.getElementById('homeHello').textContent,
      profile: window.__campusParse ? window.__campusParse.state().profile : null,
      sheetOpen: !!document.getElementById('pfSave'),
      sheetClass: sheet ? sheet.className : '',
      sheetHead: head ? head.textContent : '',
      pwdStored: /test123456/.test(raw)
    };
  })()`, true).catch((e) => ({ err: String(e) }));
  w.showInactive();
  await new Promise((r) => setTimeout(r, 700));
  try {
    const img = await w.capturePage();
    fs.writeFileSync(path.join(os.tmpdir(), 'thanks-probe.png'), img.toPNG());
    console.log('THANKS_SHOT ok');
  } catch (e) { console.log('THANKS_SHOT fail ' + String(e)); }
  console.log('PROFILE_PROBE ' + JSON.stringify({ before, saved, after }));
  try {
    const img = await w.capturePage();
    const tmp = os.tmpdir();
    fs.writeFileSync(path.join(tmp, 'profile-probe.png'), img.toPNG());
    console.log('PROFILE_SHOT ' + path.join(tmp, 'profile-probe.png'));
  } catch (e) { console.log('PROFILE_SHOT fail ' + String(e)); }
  // 探针结束后清掉本机测试资料，不留姓名/学号残留
  await w.webContents.executeJavaScript(`(() => {
    const k = 'campus_cache_v1';
    try { const c = JSON.parse(localStorage.getItem(k) || 'null'); if (c) { delete c.profile; localStorage.setItem(k, JSON.stringify(c)); } } catch (e) {}
    localStorage.removeItem('campus_weather_v1');
    return { cleaned: true };
  })()`, true).catch(() => ({}));
  app.exit(0);
}

/* 生命周期 ---------------- */

app.whenReady().then(() => {
  if (SMOKE) return runSmoke();
  if (process.argv.includes('--whgfw-probe')) return runWhgfwProbe();
  if (process.argv.includes('--sdcx-probe')) return runSdcxProbe();
  if (process.argv.includes('--grade-probe')) return runGradeProbe();
  if (process.argv.includes('--elec-probe')) return runElecProbe();
  if (process.argv.includes('--seat-probe')) return runSeatProbe();
  if (process.argv.includes('--ui-probe')) return runUiProbe();
  if (process.argv.includes('--free-probe')) return runFreeProbe();
  if (process.argv.includes('--free-open-probe')) return runFreeOpenProbe();
  if (process.argv.includes('--open-free')) { openFreeNow(); return; }
  if (process.argv.includes('--entry-probe')) return runEntryProbe();
  if (process.argv.includes('--home-probe')) return runHomeProbe();
  if (process.argv.includes('--free-query-probe')) return runFreeQueryProbe();
  if (process.argv.includes('--free-form-probe')) return runFreeFormProbe();
  if (process.argv.includes('--free-api-probe')) return runFreeApiProbe();
  if (process.argv.includes('--free-menu-probe')) return runFreeMenuProbe();
  if (process.argv.includes('--free-prefill-probe')) return runFreePrefillProbe();
  if (process.argv.includes('--wx-probe')) return runWxProbe();
  if (process.argv.includes('--sheet-probe')) { runSheetProbe().catch((e) => console.log('SHEET_ERR ' + ((e && e.message) || e))); return; }
  if (process.argv.includes('--type-probe')) { runTypeProbe().catch((e) => console.log('TYPE_ERR ' + ((e && e.message) || e))); return; }
  if (process.argv.includes('--profile-probe')) { runProfileProbe().catch((e) => console.log('PROFILE_ERR ' + ((e && e.message) || e))); return; }
  if (process.argv.includes('--probe')) return runProbe();
  if (process.argv.includes('--probe-table')) return runProbeTable();
  sharedSession();          // 先建立分区会话并设置 UA
  createMain();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createMain(); });
});

/* 会话探针：用已保存的登录态打开教务首页，打印菜单里的课表链接、学期下拉、页面标题 */
function runProbe() {
  const argUrl = (process.argv.find(a => a.startsWith('--probe-url=')) || '').replace('--probe-url=', '');
  const target = argUrl || HOME_URL;
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.webContents.on('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const r = await win.webContents.executeJavaScript(`(() => {
        const links = Array.from(document.querySelectorAll('a'))
          .map(a => ({ t: (a.textContent || '').trim().slice(0, 20), h: a.getAttribute('href') || '' }))
          .filter(x => /courseTable|schedule|课表/.test(x.h + x.t));
        const sels = Array.from(document.querySelectorAll('select'))
          .map(s => ({ name: s.name || s.id || '', opts: Array.from(s.options).map(o => o.value + ':' + o.textContent.trim().slice(0, 12)).slice(0, 12) }))
          .filter(s => /semester|term|学期/i.test(s.name + JSON.stringify(s.opts)))
          .slice(0, 6);
        const ids = (document.documentElement.innerHTML.match(/semesterId[="':\\s]+(\\d+)/gi) || []).slice(0, 5);
        return { url: location.href, title: document.title, links, sels, ids, len: document.documentElement.outerHTML.length };
      })()`, true);
      console.log('PROBE ' + JSON.stringify(r));
      const dir = path.join(__dirname, 'debug');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML', true);
      fs.writeFileSync(path.join(dir, 'home-probe.html'), html, 'utf8');
      console.log('PROBE_FILE ' + path.join(dir, 'home-probe.html'));
    } catch (e) {
      console.log('PROBE FAIL ' + String(e && e.message || e));
    }
    app.exit(0);
  });
  win.loadURL(target);
}

/* 课表探针：用已保存的登录态打开课表页，整页 DOM 存盘并统计表结构 */
function runProbeTable() {
  const win = new BrowserWindow({
    width: 1400,
    height: 950,
    show: false,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const dir = path.join(__dirname, 'debug');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  win.webContents.on('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 2500));
    try {
      const r = await win.webContents.executeJavaScript(`(() => {
        const tables = Array.from(document.querySelectorAll('table'));
        const info = tables.map((t, i) => ({
          i, rows: t.rows.length, cols: Math.max(...Array.from(t.rows).map(r => r.cells.length), 0),
          head: (t.rows[0] ? t.rows[0].textContent : '').replace(/\\s+/g, ' ').slice(0, 80),
          hasDay: /(?:星期|周)[一二三四五六日天]/.test(t.textContent),
          hasPeriod: /节次|周次/.test(t.textContent),
        }));
        const frames = Array.from(document.querySelectorAll('iframe')).map(f => f.src);
        return { url: location.href, title: document.title, len: document.documentElement.outerHTML.length, tables: info, frames };
      })()`, true);
      console.log('PROBE_TABLE ' + JSON.stringify(r));
      const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML', true);
      const f = path.join(dir, 'table-probe.html');
      fs.writeFileSync(f, html, 'utf8');
      console.log('PROBE_TABLE_FILE ' + f + ' bytes=' + html.length);
    } catch (e) {
      console.log('PROBE_TABLE FAIL ' + String(e && e.message || e));
    }
    app.exit(0);
  });
  win.loadURL(TABLE_URL);
}
/* 座位系统探针：用手机 UA + 竖屏子窗口加载 seatlib，量布局宽度并截图，判断是否落到移动断点 */
function runSeatProbe() {
  const mobile = !process.argv.includes('--seat-desktop-ua');
  const win = new BrowserWindow({
    width: 430, height: 880, show: false,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  if (mobile) win.webContents.setUserAgent(MOBILE_UA);
  const dir = path.join(__dirname, 'debug');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const consoleLines = [];
  win.webContents.on('console-message', (_e, _level, msg) => consoleLines.push(String(msg).slice(0, 200)));
  win.webContents.on('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 5000));
    try {
      const m = await win.webContents.executeJavaScript(`(() => {
        const de = document.documentElement, b = document.body;
        return { url: location.href, title: document.title,
          innerW: innerWidth, clientW: de.clientWidth,
          bodyScrollW: b ? b.scrollWidth : 0,
          fontSize: getComputedStyle(de).fontSize, dpr: devicePixelRatio,
          m767: matchMedia('(max-width:767px)').matches,
          m768: matchMedia('(min-width:768px)').matches,
          text: (b ? b.innerText : '').replace(/\\s+/g, ' ').slice(0, 200) };
      })()`, true);
      console.log('SEAT_PROBE ' + JSON.stringify({ mobile, console: consoleLines.slice(0, 20), ...m }));
      const img = await win.webContents.capturePage();
      const png = path.join(dir, mobile ? 'seat-mobile.png' : 'seat-desktop.png');
      fs.writeFileSync(png, img.toPNG());
      console.log('SEAT_PROBE_FILE ' + png);
    } catch (e) {
      console.log('SEAT_PROBE_FAIL ' + String(e && e.message || e));
    }
    app.exit(0);
  });
  win.loadURL('https://seatlib.hpu.edu.cn/libseat/#/login');
}
/* 成绩覆盖探针：用已保存的教务会话打开「学生申请成绩覆盖」，打印表结构与首行 */
function runGradeProbe() {
  const win = new BrowserWindow({
    width: 1400, height: 950, show: false,
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  const dir = path.join(__dirname, 'debug');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  win.webContents.on('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 2600));
    try {
      const r = await win.webContents.executeJavaScript(`(() => {
        const tables = Array.from(document.querySelectorAll('table')).map((t, i) => ({
          i, rows: t.rows.length,
          head: (t.rows[0] ? Array.from(t.rows[0].cells).map(c => (c.textContent||'').replace(/\\s+/g,'').slice(0,12)) : []),
          first: (t.rows[1] ? Array.from(t.rows[1].cells).map(c => (c.textContent||'').replace(/\\s+/g,'').slice(0,20)) : []),
        })).filter(t => t.rows > 1);
        return {
          url: location.href, title: document.title,
          needLogin: /login\\.action|loginExt|cas|统一身份认证/.test(location.href + document.title),
          text: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 300),
          tables,
        };
      })()`, true);
      console.log('GRADE_PROBE ' + JSON.stringify(r));
      // 顺手验一次翻页：抓第一页 → 点下一页 → 再看第一页签名有没有变
      const p1 = await win.webContents.executeJavaScript(GRADE_EXTRACT, true);
      console.log('GRADE_P1 ' + JSON.stringify({ ok: p1.ok, count: p1.count, pageInfo: p1.pageInfo, sig: (p1.sig || '').slice(0, 60) }));
      const nx = await win.webContents.executeJavaScript(GRADE_NEXT, true);
      console.log('GRADE_NEXT_RES ' + JSON.stringify(nx));
      if (nx && nx.hit) {
        await new Promise((r2) => setTimeout(r2, 2200));
        const p2 = await win.webContents.executeJavaScript(GRADE_EXTRACT, true);
        console.log('GRADE_P2 ' + JSON.stringify({ ok: p2.ok, count: p2.count, pageInfo: p2.pageInfo, sig: (p2.sig || '').slice(0, 60) }));
      }
      const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML', true);
      const f = path.join(dir, 'grade-probe.html');
      fs.writeFileSync(f, html, 'utf8');
      console.log('GRADE_PROBE_FILE ' + f + ' bytes=' + html.length);
    } catch (e) {
      console.log('GRADE_PROBE_FAIL ' + String((e && e.message) || e));
    }
    app.exit(0);
  });
  win.loadURL(GRADE_URL);
}

function runSmoke() {
  const win = new BrowserWindow({
    width: 430,
    height: 900,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  const errors = [];
  win.webContents.on('console-message', (_e, level, message) => {
    if (level >= 2) errors.push(message);
  });
  win.webContents.on('did-finish-load', async () => {
    await new Promise((r) => setTimeout(r, 1200));
    try {
      const r = await win.webContents.executeJavaScript(`(() => ({
        bridge: typeof window.hpu,
        isShell: !!(window.hpu && window.hpu.isShell),
        home: !!document.querySelector('#s-home'),
        tabs: Array.from(document.querySelectorAll('.tab')).map(t => t.dataset.tab),
        loginForm: !!document.querySelector('#loginFormBody'),
        loginShell: !!document.querySelector('#loginShellBody'),
        shellBtn: !!document.querySelector('#shellLoginBtn'),
        protoBytes: document.documentElement.outerHTML.length
      }))()`, true);
      console.log('SMOKE ' + JSON.stringify({ ...r, errors }));
      app.exit(r.isShell && r.home && r.tabs.length === 5 && r.shellBtn ? 0 : 2);
    } catch (e) {
      console.log('SMOKE FAIL ' + String(e && e.message || e));
      app.exit(3);
    }
  });
  win.loadFile(PROTO);
}

app.on('window-all-closed', () => { app.quit(); });

// 单实例，避免多点开各自一套会话（自检/探针模式不参与，便于壳开着时跑）
if (SMOKE || process.argv.includes('--grade-probe') || process.argv.includes('--elec-probe')
  || process.argv.includes('--seat-probe') || process.argv.includes('--ui-probe')
  || process.argv.includes('--entry-probe') || process.argv.includes('--free-probe')
  || process.argv.includes('--free-open-probe') || process.argv.includes('--open-free')
  || process.argv.includes('--free-query-probe') || process.argv.includes('--free-form-probe')
  || process.argv.includes('--free-api-probe') || process.argv.includes('--free-menu-probe')
  || process.argv.includes('--free-prefill-probe') || process.argv.includes('--wx-probe')
  || process.argv.includes('--home-probe') || process.argv.includes('--profile-probe') || process.argv.includes('--type-probe') || process.argv.includes('--sheet-probe')) {
  // 不做单实例检查
} else if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWin) { mainWin.show(); mainWin.focus(); }
  });
}
