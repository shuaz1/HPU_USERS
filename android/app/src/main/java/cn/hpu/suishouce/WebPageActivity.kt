package cn.hpu.suishouce

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import org.json.JSONObject
import org.json.JSONTokener

/**
 * 应用内浏览器窗口：
 *  - browse：普通浏览（教务、seatlib、电费站、缴费、办事大厅）
 *  - login：等页面落到教务首页，抓一份 HTML 交给主页面解析课表
 *  - grades：注入 grade-scraper.js，自己翻页并把结果回传
 *  - free：打开空闲教室页并把条件预填好，由用户点「查询」
 */
class WebPageActivity : Activity() {

    companion object {
        const val GRADE_URL = "https://zhjw.hpu.edu.cn/eams/teach/grade/course/std-grade-modify-apply.action"

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
    private var mode = "browse"
    private var sent = false
    private var scraperLoaded = false
    private var prefill = ""
    private var fillTries = 0
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = 0xFF050D16.toInt()
        window.navigationBarColor = 0xFF050D16.toInt()

        mode = intent.getStringExtra("mode") ?: "browse"
        prefill = intent.getStringExtra("prefill") ?: ""
        val url = intent.getStringExtra("url") ?: "about:blank"
        val ua = intent.getStringExtra("ua") ?: "auto"

        web = WebView(this)
        web.setBackgroundColor(0xFFFFFFFF.toInt())
        setContentView(web)

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.setSupportZoom(true)
        s.builtInZoomControls = true
        s.displayZoomControls = false
        s.loadWithOverviewMode = true
        s.useWideViewPort = true
        s.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        s.userAgentString = when {
            ua == "desktop" -> Http.DESKTOP_UA
            else -> pickUa(url)
        }
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.addJavascriptInterface(PageBus(), "HpuPage")
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean = false
            override fun shouldOverrideUrlLoading(view: WebView, u: String): Boolean = false

            override fun onPageFinished(view: WebView?, u: String?) {
                val at = u ?: return
                when (mode) {
                    "login" -> if (!sent && isEamsHome(at)) captureHtml(at)
                    "grades" -> if (!scraperLoaded) { scraperLoaded = true; loadScraper() }
                    "free" -> scheduleFill(at)
                }
            }
        }

        web.loadUrl(url)
    }

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
