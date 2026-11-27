// 预加载脚本：只向页面暴露最小 API，页面本身拿不到 Node 能力
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hpu', {
  isShell: true,
  platform: process.platform,
  // 打开学校统一认证，登录成功后回到课表页并抓取页面 HTML
  loginAndFetchCourses: () => ipcRenderer.invoke('hpu:login'),
  // 查宿舍水电读数（sdcx 免登录读数页，三级联动 + 记录）
  sdcx: (opts) => ipcRenderer.invoke('hpu:sdcx', opts || {}),
  // 查宿舍电费（183.169.255.4:8080，免登录三级联动 + 剩余电量/记录）
  elec: (opts) => ipcRenderer.invoke('hpu:elec', opts || {}),
  // 抓成绩：同一套 CAS 登录 → 综合教务「学生申请成绩覆盖」表格
  grades: () => ipcRenderer.invoke('hpu:grades'),
  // 应用内打开任意页面（共用同一个登录会话）
  openInApp: (url, title) => ipcRenderer.invoke('hpu:open', { url, title }),
  // 保存当前应用内窗口的页面结构（空闲教室分析用，落 debug/free-snap.*）
  freeSnap: () => ipcRenderer.invoke('hpu:freeSnap'),
  // 空闲教室原生查询（复用教务登录态，返回教室列表）
  freeQuery: (opts) => ipcRenderer.invoke('hpu:free', opts || {}),
  freeFilters: (opts) => ipcRenderer.invoke('hpu:freeFilters', opts || {}),
  // 清空登录会话（退出登录 / 换账号）
  clearSession: () => ipcRenderer.invoke('hpu:clear'),
  // 查询当前是否已经有教务登录态
  sessionState: () => ipcRenderer.invoke('hpu:session'),
});
