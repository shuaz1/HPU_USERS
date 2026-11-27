# 校园助手 · 桌面 WebView 壳（Electron）

给 `手机端原型.html` 套一层真实 WebView：能打开学校统一认证的真实页面、持久化登录态、注入 JS 抓课表、把 HTML 回传给原型解析。

## 为什么是 Electron

本机工具链实测：node / npm / python 3.13 / MinGW gcc / git 有，WebView2 运行时已装；**没有 JDK、Android SDK、.NET SDK、MSVC**（`C:\Program Files\Microsoft Visual Studio` 是空壳）。所以 Kotlin / Flutter / .NET WebView2 三条路在这台机器上都起不来，Electron（自带 Chromium，即 WebView）是唯一能立刻跑起来的。

代价：打包后 ~150–200MB，做不到你朋友那种 <1MB。要 1MB 级只能等 Android Kotlin 壳（需装 JDK 17 + Android SDK）。

## 运行

```bat
cd C:\Users\chengxiang\Desktop\校园综合管理\hpu-shell
启动壳.bat
```
或 `npm start`（已装依赖 `electron@33`）。

## 已实现

| 能力 | 实现 |
| --- | --- |
| 应用内打开学校页面 | 子 `BrowserWindow`，共用 `persist:hpu-session` 分区，cookie 落盘 `%USERPROFILE%\.hpu-campus-shell` |
| 统一认证登录 | 直接加载 `uia.hpu.edu.cn/cas/login?service=…/eams/login.action`；窗口 980×920（教务是桌面版页面，窄窗会把表单挤到屏幕外），标题实时提示当前状态 |
| 教务登录页兼容 | 未登录访问 `homeExt.action` / `courseTableForStd.action` 都会 302 到 `loginExt.action`。该页自带 `username` / `password` / `captcha_response` 表单，也有「从平台登录」→ `/eams/sso/login.action`；两条路都能走通，壳里不干预 |
| 不抢跳 | 判定改为每 1.2 秒轮询 URL：CAS 页、`login.action`、`loginExt.action` 一律不主动跳转；进入教务内部页面后先等 2.2 秒跳转稳定，再从页面里找课表链接 |
| 登录后自动抓课表 | 进入 `zhjw.hpu.edu.cn` 内部页面 → 在首页 DOM 里找 `courseTableForStd` 的真实链接（带 semesterId 等参数），取不到才退回固定地址 → 等 1.8s → 注入脚本取含「星期X/节次/周次」的表 `outerHTML`；主框架取不到会遍历子 frame |
| 回传解析 | IPC 返回 HTML，原型用现有 `parseEamsHTML` 解析 → `previewCourses` 出导入预览 |
| 外链拦截 | 非 `hpu.edu.cn` 的导航一律交给系统浏览器，页面不越权 |
| 清除会话 | 校园页/登录层的「清除本机登录会话」调 `clearStorageData` |

## 桥接 API（`preload.js` 注入 `window.hpu`）

```js
window.hpu = {
  isShell: true,
  platform: 'win32',
  loginAndFetchCourses(): Promise<{ ok, html?, reason?, url?, tables? }>,
  openInApp(url, title): Promise<{ ok }>,
  clearSession(): Promise<{ ok }>,
  sessionState(): Promise<{ logged, hints }>,
}
```

原型里判断 `window.hpu.isShell`：为真时登录层换成「打开学校认证页登录」，宿舍查询/购电走真实窗口；为假时保持演示交互。

## 自检

```bat
node_modules\electron\dist\electron.exe . --smoke --no-sandbox
```
输出 `SMOKE {...}`：桥接、5 个 tab、登录层结构。退出码 0 为通过。

## 已知限制 / 待办

1. **课表抓取未用真实账号验证过**：登录后的 DOM 结构（是否 iframe、是否需先选学期）要在你本人登录一次后确认；若抓不到会提示「没找到课表」并可退回网页/HTML 导入。
2. 打包安装包未做（需 `electron-builder`，还没联网安装）。当前靠 `启动壳.bat` 运行。
3. 最终要上手机：Electron 不是手机方案；确认原型与抓取逻辑后再决定装 JDK + Android SDK 走 Kotlin WebView。
4. 登录态存在 Chromium cookie 里（磁盘上的加密 SQLite），不是 Windows 凭据管理器；如需更接近「Keystore」可后续接 DPAPI 加密自己的凭据缓存。
