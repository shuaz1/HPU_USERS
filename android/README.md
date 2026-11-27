# 理工随身册 · 安卓版

自用工具，不上架。把桌面壳里那套页面原样装进 WebView，教务/电费/座位这些真实入口照旧，数据只存手机本机。

## 一、目录结构

```
android/
  app/src/main/
    AndroidManifest.xml              清单（minSdk 21 / targetSdk 34）
    assets/index.html                打包时由 tools/build-android-assets.js 生成（勿手改）
    assets/hpu-native.js             window.hpu 的安卓实现（源码在 android/bridge/）
    assets/grade-scraper.js          成绩翻页抓取脚本
    assets/free-prefill.js           空闲教室条件预填
    java/cn/hpu/suishouce/
      MainActivity.kt                主页 WebView
      WebPageActivity.kt             应用内浏览器（浏览 / 登录抓课表 / 抓成绩 / 预填空教室）
      HpuBridge.kt                   原生桥，方法表和 preload.js 对齐
      Http.kt                        HttpURLConnection + CookieManager 会话共用
    res/xml/network_security_config.xml   明文 http 放行（电费站 183.169.255.4:8080 等）
  bridge/                            桥的 JS 源码（改这里，别改 assets）
  build.gradle.kts / gradle.properties
```

## 二、怎么出 APK

### 1. 本地（有 Android Studio 的话最快）

1. 装 Android Studio（自带 JDK 17 + SDK）。
2. 打开 `android/` 目录，等 Gradle 同步完。
3. 先跑一次 `node tools/build-android-assets.js`（在项目根目录执行，生成 assets）。
4. Build → Build Bundle(s)/APK(s) → Build APK(s)，产物在 `android/app/build/outputs/apk/debug/`。

### 2. 没有 Android Studio：用 GitHub Actions 云编译

1. 把整个项目推到自己的 GitHub 仓库（私有仓库也行）。
2. 仓库已带 `.github/workflows/android.yml`，推 tag 或手动点 Run 就会编译。
3. 跑完在该次 Actions 页面的 Artifacts 里下 `hpu-release-apk`，解压得到 APK。

### 3. 自签 release（想长期自己用建议做）

```bash
keytool -genkeypair -v -keystore hpu-release.jks -alias hpu \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storepass hpu123456 -keypass hpu123456 \
  -dname "CN=HPU, OU=Self, O=Self, L=Jiaozuo, S=Henan, C=CN"
```

把 `hpu-release.jks` 放到 `android/app/` 下，Gradle 会自动启用它签 release；密码默认 `hpu123456`，可用环境变量 `HPU_KS_PASS` / `HPU_KEY_PASS` / `HPU_KS_ALIAS` 覆盖。

> 换签名必须卸载重装（安卓不允许签名不同的包覆盖安装）。本机数据会一起清掉。

## 三、装到手机

1. 手机设置里允许「安装未知来源应用」（Android 8+ 是给具体应用授权）。
2. 把 APK 传进手机（数据线 / 微信文件传输 / 网盘都行），点开安装。
3. 首次打开会强制填学号、姓名、密码（密码只用于当场校验，不落盘）。
4. 想抓课表就去「课表 → 统一认证登录」走一次网页登录；登录态存在 WebView 的 cookie 里，成绩、电费后续复用。

## 四、兼容性

| 系统 | 能不能用 | 说明 |
| --- | --- | --- |
| Android 8.0+ | 完整 | 系统 WebView 一般 ≥ 60，配色、毛玻璃、间距都正常 |
| Android 5.0–7.x | 能装，取决于 WebView | 系统 WebView 没更新到 Chrome 55+ 会白屏；构建时用 esbuild 按 chrome49 转译可绕过语法门槛，但很老的 WebView 仍可能掉色 |
| Android 12+ | 完整 | color-mix 已全部改写成 rgba，不依赖新特性 |

`minSdk = 21`，谁都能装；`targetSdk = 34`。

## 五、已知限制（如实写）

- **空闲教室**：教务接口对日期/时段不生效（换日期返回同一批教室），所以只做「打开页面 + 预填条件」，结果由网页自己算，用户点「查询」。
- **专业排名**：教务没有对应数据源，界面上保持「未同步」。
- **电费**：走 http 明文 + ASP.NET 三级联动，和桌面壳同一套协议；站点改版就要重新对字段。
- **不代收支付**：购电、缴费都是打开学校原站，应用不碰支付信息。
- **不上架**：应用名、包名都不带学校官方标识，README 和关于页写明「非官方 · 刷子制作」。

## 六、改东西的顺序

1. 改页面：改 `手机端原型.html`（桌面壳和安卓共用这一份）。
2. 改桥：改 `android/bridge/*.js`，或 Kotlin 里的 `HpuBridge` / `WebPageActivity`。
3. 重新生成 assets：`node tools/build-android-assets.js`。
4. 发版：`android/gradle.properties` 的 `versionCode` +1、`versionName` 改新号；同时改 `手机端原型.html` 顶部的 `APP_VERSION` / `APP_BUILD`（设置页和页脚会跟着变）。
