package cn.hpu.suishouce

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.CookieManager
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

class MainActivity : Activity() {

    lateinit var web: WebView
    private var pendingFile: ValueCallback<Array<Uri>>? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = 0xFF050D16.toInt()
        window.navigationBarColor = 0xFF050D16.toInt()

        web = WebView(this)
        web.setBackgroundColor(0xFF050D16.toInt())
        setContentView(web)

        val s = web.settings
        s.javaScriptEnabled = true
        s.domStorageEnabled = true
        s.databaseEnabled = true
        s.allowFileAccess = true
        s.allowContentAccess = true
        s.setSupportZoom(false)
        s.builtInZoomControls = false
        s.displayZoomControls = false
        s.textZoom = 100
        s.loadWithOverviewMode = false
        s.useWideViewPort = true
        s.mediaPlaybackRequiresUserGesture = false
        s.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        if (Build.VERSION.SDK_INT >= 26) s.safeBrowsingEnabled = false
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(web, true)

        web.addJavascriptInterface(HpuBridge(this), "HpuNative")

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                view: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                pendingFile?.onReceiveValue(null)
                pendingFile = callback
                val i = Intent(Intent.ACTION_GET_CONTENT)
                i.addCategory(Intent.CATEGORY_OPENABLE)
                i.type = "*/*"
                return try {
                    startActivityForResult(Intent.createChooser(i, "选择文件"), REQ_FILE)
                    true
                } catch (e: Exception) {
                    pendingFile = null
                    false
                }
            }
        }

        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, url: String): Boolean = handleUrl(url)

            override fun shouldOverrideUrlLoading(view: WebView, req: WebResourceRequest): Boolean =
                handleUrl(req.url.toString())
        }

        web.loadUrl("file:///android_asset/index.html")
    }

    /** 站内页面一律在应用内新开竖屏窗口，不往外跳浏览器 */
    private fun handleUrl(url: String): Boolean {
        if (url.startsWith("file://")) return false
        if (url.startsWith("mailto:") || url.startsWith("tel:")) {
            try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (_: Exception) { }
            return true
        }
        WebPageActivity.start(this, url, "", "browse", "auto", "")
        return true
    }

    override fun onBackPressed() {
        if (this::web.isInitialized && web.canGoBack()) {
            web.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode == REQ_FILE) {
            val cb = pendingFile
            pendingFile = null
            if (cb == null) { super.onActivityResult(requestCode, resultCode, data); return }
            if (resultCode != RESULT_OK || data?.data == null) {
                cb.onReceiveValue(null)
            } else {
                cb.onReceiveValue(arrayOf(data.data!!))
            }
            return
        }
        super.onActivityResult(requestCode, resultCode, data)
    }

    companion object {
        private const val REQ_FILE = 1001
    }
}
