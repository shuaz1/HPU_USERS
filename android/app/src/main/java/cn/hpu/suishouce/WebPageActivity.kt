package cn.hpu.suishouce

import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import org.json.JSONObject
import org.json.JSONTokener

/**
 * 应用内浏览器窗口（默认用电脑标识加载，顶部可切回手机版）：
 *  - browse：普通浏览（教务、seatlib、电费站、缴费、办事大厅）
 *  - login：先在统一认证登录，再跳到课表页，等课表画出来才抓
 *  - grades：注入 grade-scraper.js，自己翻页并把结果回传
 *  - free：打开空闲教室页并把条件预填好，由用户点「查询」
 */
class WebPageActivity : Activity() {

    companion object {
        const val GRADE_URL = "https://zhjw.hpu.edu.cn/eams/teach/grade/course/std-grade-modify-apply.action"
        // 课表真身在独立的课表页，教务首页里没有课表；登录完必须跳过去抓
        const val TABLE_URL = "https://zhjw.hpu.edu.cn/eams/courseTableForStd!courseTable.action"
        const val TABLE_ALT = "https://zhjw.hpu.edu.cn/eams/courseTableForStd!courseTable.action?setting.kind=std&ignoreHead=1"
        const val TABLE_INDEX = "https://zhjw.hpu.edu.cn/eams/courseTableForStd!index.action"

        /** 默认用电脑标识的站点：只有教务系统 */
        val DESKTOP_HOSTS = listOf("zhjw.hpu.edu.cn")

        fun start(act: Activity, url: String, title: String, mode: String, ua: String, prefill: String) {
            val i = Intent(act, WebPageActivity::class.java)
            i.putExtra("url", url)
            i.putExtra("title", title)
            i.putExtra("mode", mode)
            i.putExtra("ua", ua)
            i.putExtra("prefill", prefill)
            act.startActivity(i)
        }
    }

    private lateinit var web: WebView
    private var uaBtn: TextView? = null
    private var desktopMode = true
    private var mode = "browse"
    private var sent = false
    private var scraperLoaded = false
    private var prefill = ""
    private var fillTries = 0
    private var stage = 0          // 0=等登录落地  1=已到教务首页，准备跳课表  2=已在课表页
    private var altTry = 0          // 课表页三种地址的重试计数
    private var entryUrl = ""        // 打开时的入口地址，切 UA 重载用
    private var curUrl = ""          // 当前真实地址
    private var blankTold = ""       // 已提示过空白的地址，避免反复弹
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = 0xFF0E2A22.toInt()
        window.navigationBarColor = 0xFF0E2A22.toInt()

        mode = intent.getStringExtra("mode") ?: "browse"
        prefill = intent.getStringExtra("prefill") ?: ""
        val url = intent.getStringExtra("url") ?: "about:blank"
        val ua = intent.getStringExtra("ua") ?: "auto"

        // 只有教务系统（zhjw）本来就是按电脑排版的，才默认用电脑标识；
        // 图书馆座位、微后勤、缴费、办事大厅这些都是移动端页面，用电脑标识会被塞进小屏，
        // 出现错位、白屏、“像没加载出来”的情况。剩下的一律跟随手机默认 UA。
        desktopMode = when (ua) {
            "mobile" -> false
            "desktop" -> true
            else -> DESKTOP_HOSTS.any { url.contains(it) }
        }
        entryUrl = url

        val root = LinearLayout(this)
        root.orientation = LinearLayout.VERTICAL
        root.setBackgroundColor(0xFFF3F5F4.toInt())

        if (mode == "browse" || mode == "free") {
            root.addView(buildBar(), LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(44)))
        }

        web = WebView(this)
        web.setBackgroundColor(Color.WHITE)
        root.addView(web, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))
        setContentView(root)

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.setSupportZoom(true)
        s.builtInZoomControls = true
        s.displayZoomControls = false
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.textZoom = 100
        s.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        applyUa(false)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.addJavascriptInterface(PageBus(), "HpuPage")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean = false
            override fun shouldOverrideUrlLoading(view: WebView, u: String): Boolean = false

            override fun onPageStarted(view: WebView?, u: String?, favicon: android.graphics.Bitmap?) {
                if (u != null) curUrl = u
            }

            override fun onPageFinished(view: WebView?, u: String?) {
                val at = u ?: return
                curUrl = at
                // 不再强行改页面 viewport：WebView 自带的自适应排版（useWideViewPort + overview）
                // 就够用，硬塞 width=1280 反而把手机页面按桌面宽度重排，错位、白屏
                when (mode) {
                    "login" -> handleLogin(at)
                    "grades" -> if (!scraperLoaded) { scraperLoaded = true; loadScraper() }
                    "free" -> scheduleFill(at)
                }
                checkNotBlank(at)
            }

            override fun onReceivedError(
                view: WebView?, errorCode: Int, description: String?, failingUrl: String?
            ) {
                toast("加载失败：" + (description ?: "网络错误") + "\n可点左上角切换电脑版/手机版再试")
            }
        }

        web.loadUrl(url)
    }

    /* ---------------- 顶部工具条：电脑版 / 手机版、刷新、关闭 ---------------- */

    private fun buildBar(): LinearLayout {
        val bar = LinearLayout(this)
        bar.orientation = LinearLayout.HORIZONTAL
        bar.gravity = Gravity.CENTER_VERTICAL
        bar.setBackgroundColor(0xFF0E2A22.toInt())

        val btn = barButton(if (desktopMode) "电脑版" else "手机版") { toggleUa() }
        uaBtn = btn
        bar.addView(btn, LinearLayout.LayoutParams(dp(88), dp(44)))

        val title = TextView(this)
        title.text = intent.getStringExtra("title") ?: ""
        title.setTextColor(0xFF9FB6AC.toInt())
        title.textSize = 12f
        title.gravity = Gravity.CENTER
        title.maxLines = 1
        bar.addView(title, LinearLayout.LayoutParams(0, dp(44), 1f))

        bar.addView(barButton("刷新") { web.reload() }, LinearLayout.LayoutParams(dp(62), dp(44)))
        bar.addView(barButton("关闭") { finish() }, LinearLayout.LayoutParams(dp(62), dp(44)))
        return bar
    }

    private fun barButton(text: String, onClick: () -> Unit): TextView {
        val tv = TextView(this)
        tv.text = text
        tv.setTextColor(0xFFE9D8A6.toInt())
        tv.textSize = 13f
        tv.gravity = Gravity.CENTER
        tv.setPadding(dp(10), 0, dp(10), 0)
        tv.setOnClickListener { onClick() }
        return tv
    }

    private fun toggleUa() {
        desktopMode = !desktopMode
        uaBtn?.text = if (desktopMode) "电脑版" else "手机版"
        applyUa(true)
        toast(if (desktopMode) "已切换为电脑版，正在重新加载" else "已切换为手机版，正在重新加载")
    }

    private fun applyUa(reload: Boolean) {
        web.settings.userAgentString = if (desktopMode) Http.DESKTOP_UA else WebSettings.getDefaultUserAgent(this)
        if (!reload) return
        // 光 reload 会沿用上一次用旧 UA 取到的渲染结果，先清缓存再从头请求
        val target = if (curUrl.isNotEmpty() && !curUrl.startsWith("about:")) curUrl else entryUrl
        web.stopLoading()
        web.clearCache(true)
        web.loadUrl("about:blank")
        handler.postDelayed({
            if (!isFinishing) web.loadUrl(target)
        }, 150)
    }

    /** 整页几乎没文字时提示一下，免得用户在空白页干等（同一地址只提示一次） */
    private fun checkNotBlank(at: String) {
        if (at == blankTold) return
        handler.postDelayed({
            if (isFinishing || sent) return@postDelayed
            web.evaluateJavascript(
                "(function(){var b=document.body;return b?b.innerText.replace(/\\s/g,'').length:0})()"
            ) { raw ->
                val n = unquote(raw).toIntOrNull() ?: 0
                if (n < 20 && at != blankTold) {
                    blankTold = at
                    toast("这页没渲染出内容，可点左上角切「电脑版/手机版」再试")
                }
            }
        }, 1500)
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    /** 教务抓页面用桌面 UA，手机站/认证站用系统默认（手机）UA */
    private fun pickUa(url: String): String {
        return if (Regex("zhjw\\.hpu\\.edu\\.cn|183\\.169\\.255\\.4|pay\\.hpu\\.edu\\.cn").containsMatchIn(url)) {
            Http.DESKTOP_UA
        } else {
            WebSettings.getDefaultUserAgent(this)
        }
    }

    private fun isEamsHome(url: String) =
        Regex("zhjw\\.hpu\\.edu\\.cn/eams/home(Ext)?\\.action", RegexOption.IGNORE_CASE).containsMatchIn(url)

    /**
     * 登录流程分两步：先在认证页登录、落回教务首页；再跳到课表页，等课表渲染完才抓。
     * 直接抓首页会拿到没有课表的空页面。
     */
    private fun handleLogin(at: String) {
        if (sent) return
        if (stage == 0) {
            if (isEamsHome(at)) {
                stage = 1
                toast("登录成功，正在打开课表…")
                handler.postDelayed({ extractHomeTableTarget() }, 900)
            }
            return
        }
        if (at.contains("courseTableForStd")) {
            stage = 2
            pollTable(0)
        }
    }

    /**
     * 教务课表页必须带学期 id，否则服务端抛 “id to load is required for loading”。
     * 先在首页 DOM 里找课表链接 / 学期下拉，拼成带参数的地址再跳转。
     */
    private fun extractHomeTableTarget() {
        if (sent || isFinishing) return
        web.evaluateJavascript(homeFindJs()) { raw ->
            if (sent) return@evaluateJavascript
            val s = unquote(raw)
            var href = ""
            var sid = ""
            try {
                val j = JSONObject(s)
                href = j.optString("href")
                sid = j.optString("semesterId")
            } catch (_: Exception) { }

            val target = when {
                href.startsWith("http") -> href
                href.isNotEmpty() -> resolveHref(href)
                sid.isNotEmpty() -> "$TABLE_URL?semesterId=$sid&setting.kind=std&ignoreHead=1"
                else -> TABLE_ALT
            }
            Log.d("HpuLogin", "table target=$target")
            web.loadUrl(target)
        }
    }

    private fun resolveHref(href: String): String {
        return when {
            href.startsWith("http") -> href
            href.startsWith("/") -> "https://zhjw.hpu.edu.cn" + href
            else -> "https://zhjw.hpu.edu.cn/" + href
        }
    }

    private fun homeFindJs(): String =
        "(function(){" +
            "var fromEls=function(sel){return Array.prototype.slice.call(document.querySelectorAll(sel)).map(function(el){return el.getAttribute('href')||el.getAttribute('action')||'';}).filter(function(u){return /courseTableForStd/i.test(u);});};" +
            "var hit=fromEls('a')[0]||fromEls('form')[0]||'';" +
            "if(!hit){var src=document.documentElement.innerHTML;var m=src.match(/[\\/a-zA-Z0-9_.!?&=%-]*courseTableForStd[A-Za-z0-9_.!?&=%-]*/);if(m)hit=m[0];}" +
            "var sid='';" +
            "var sels=Array.prototype.slice.call(document.querySelectorAll('select'));" +
            "for(var i=0;i<sels.length;i++){var n=((sels[i].name||'')+' '+(sels[i].id||'')).toLowerCase();if(n.indexOf('semester')>=0||n.indexOf('term')>=0){var o=sels[i].querySelector('option[selected]')||sels[i].options[sels[i].selectedIndex];sid=(o&&o.value)||'';break;}}" +
            "if(!sid){var all=document.documentElement.innerHTML;var mm=all.match(/semester[Ii]d=(\\d+)/);if(mm)sid=mm[1];}" +
            "return JSON.stringify({href:hit,semesterId:sid});" +
        "})()"

    /** 课表是页面里的 JS 画出来的，等它真的渲染出「星期/周一…」再抓 */
    private fun pollTable(tries: Int) {
        if (sent) return
        val js = "(function(){var h=document.documentElement.outerHTML||'';" +
            "return h.length+'@'+(/(星期|周[一二三四五六日天])/.test(h)?'1':'0')})()"
        web.evaluateJavascript(js) { raw ->
            if (sent) return@evaluateJavascript
            val res = unquote(raw)
            if (res.endsWith("@1")) {
                captureHtml(web.url ?: "")
            } else if (tries < 8) {
                handler.postDelayed({ pollTable(tries + 1) }, 700)
            } else {
                tryAlt()
            }
        }
    }

    private fun tryAlt() {
        if (sent) return
        when (altTry) {
            0 -> {
                altTry = 1
                toast("课表没渲染出来，先下课表查询页…")
                web.loadUrl(TABLE_INDEX)
            }
            1 -> {
                altTry = 2
                toast("再试带参数地址…")
                web.loadUrl(TABLE_ALT)
            }
            else -> {
                sent = true
                HpuBridge.deliver(
                    JSONObject().put("ok", false)
                        .put("reason", "课表页里没读到课程表（可能这学期还没排课，或页面改版）")
                        .toString()
                )
                finish()
            }
        }
    }

    private fun toast(msg: String) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()
    }

    override fun onDestroy() {
        if (mode == "login" && !sent) {
            sent = true
            HpuBridge.deliver(
                JSONObject().put("ok", false).put("reason", "登录窗口已关闭，没有抓到课表").toString()
            )
        }
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }

    /** 把当前页整份 HTML 交回主页面（课表解析在网页那侧做） */
    private fun captureHtml(at: String) {
        if (sent) return
        sent = true
        web.evaluateJavascript("(function(){return document.documentElement.outerHTML})()") { raw ->
            val html = unquote(raw)
            val json = JSONObject().put("ok", html.isNotEmpty()).put("html", html).put("url", at).toString()
            HpuBridge.deliver(json)
            finish()
        }
    }

    private fun unquote(raw: String?): String {
        if (raw == null || raw == "null") return ""
        return try { JSONTokener(raw).nextValue() as? String ?: "" } catch (e: Exception) { "" }
    }

    private fun loadScraper() {
        val js = readAsset("grade-scraper.js")
        if (js.isEmpty()) {
            finish()
            return
        }
        web.evaluateJavascript(js, null)
    }

    private fun scheduleFill(at: String) {
        if (!Regex("std-activity|free!index", RegexOption.IGNORE_CASE).containsMatchIn(at)) return
        if (fillTries++ > 40) return
        web.evaluateJavascript("(function(){try{return window.__hpuFill ? window.__hpuFill($prefill) : 'nofn'}catch(e){return 'err:'+e.message}})()") { r ->
            val res = unquote(r)
            if (res == "filled") {
                Log.d("HpuFree", "prefilled")
            } else {
                handler.postDelayed({ scheduleFill(at) }, 700)
            }
        }
    }

    private fun readAsset(name: String): String {
        return try {
            assets.open(name).bufferedReader(Charsets.UTF_8).use { it.readText() }
        } catch (e: Exception) {
            ""
        }
    }

    override fun onBackPressed() {
        if (this::web.isInitialized && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    /** 页面侧回传通道：成绩脚本抓完、或预填完成时调用 */
    inner class PageBus {
        @JavascriptInterface
        fun pageDone(json: String) {
            val fixed = if (json.startsWith("{")) json else "{\"ok\":false,\"reason\":\"脚本没给结果\"}"
            runOnUiThread {
                HpuBridge.deliver(fixed)
                finish()
            }
        }

        @JavascriptInterface
        fun pageLog(msg: String) {
            Log.d("HpuPage", msg)
        }
    }
}
