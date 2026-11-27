package cn.hpu.suishouce

import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import org.json.JSONArray
import org.json.JSONObject

/**
 * 原生桥：页面里通过 HpuNative.call(方法, JSON, 回调号) 调进来，
 * 结果再通过 window.__hpuDone(回调号, ok, JSON) 回给前端。
 * 方法表跟桌面壳 preload.js 的 window.hpu 一一对应，页面代码不用改。
 */
class HpuBridge(private val act: MainActivity) {

    companion object {
        @Volatile
        private var inst: HpuBridge? = null

        /** 子页面（WebPageActivity）出结果后交回主页面 */
        fun deliver(json: String) {
            inst?.deliverResult(json)
        }
    }

    private var captureId: String? = null

    init {
        inst = this
    }

    private fun deliverResult(json: String) {
        val id = synchronized(this) {
            val i = captureId
            captureId = null
            i
        }
        if (id != null) reply(id, true, json)
    }

    @JavascriptInterface
    fun call(method: String, payload: String, cbId: String) {
        val p = try {
            JSONObject(payload.ifBlank { "{}" })
        } catch (e: Exception) {
            JSONObject()
        }

        when (method) {
            "http" -> Thread {
                val r = Http.request(
                    url = p.optString("url"),
                    method = p.optString("method", "GET"),
                    body = p.optString("body").ifEmpty { null },
                    ua = p.optString("ua").ifEmpty { null },
                    referer = p.optString("referer").ifEmpty { null }
                )
                reply(cbId, true, r.toString())
            }.start()

            "open" -> {
                val url = p.optString("url")
                val mode = p.optString("mode", "browse")
                val title = p.optString("title")
                val ua = p.optString("ua", "auto")
                val prefill = p.optJSONObject("prefill")?.toString() ?: ""
                synchronized(this) {
                    captureId = if (mode == "login" || mode == "grades") cbId else null
                }
                act.runOnUiThread {
                    try {
                        WebPageActivity.start(act, url, title, mode, ua, prefill)
                        if (mode != "login" && mode != "grades") {
                            reply(cbId, true, JSONObject().put("ok", true).put("opened", true).toString())
                        }
                    } catch (e: Exception) {
                        synchronized(this) { captureId = null }
                        reply(cbId, false, JSONObject().put("message", e.message ?: "页面打不开").toString())
                    }
                }
            }

            // 抓成绩：交给 WebPageActivity 注入的脚本，边翻页边回传
            "grades" -> act.runOnUiThread {
                synchronized(this) { captureId = cbId }
                try {
                    WebPageActivity.start(act, WebPageActivity.GRADE_URL, "成绩同步", "grades", "desktop", "")
                } catch (e: Exception) {
                    synchronized(this) { captureId = null }
                    reply(cbId, false, JSONObject().put("message", e.message ?: "打不开成绩页").toString())
                }
            }

            "session" -> Thread { reply(cbId, true, sessionJson()) }.start()

            "clear" -> {
                CookieManager.getInstance().removeAllCookies(null)
                CookieManager.getInstance().flush()
                reply(cbId, true, JSONObject().put("ok", true).toString())
            }

            else -> reply(cbId, false, JSONObject().put("message", "未知方法：$method").toString())
        }
    }

    private fun sessionJson(): String {
        val cookie = CookieManager.getInstance()
            .getCookie("https://zhjw.hpu.edu.cn/eams/homeExt.action") ?: ""
        val re = Regex("CASTGC|JSESSIONID|SESSION|UIA|route", RegexOption.IGNORE_CASE)
        val names = cookie.split(";").map { it.trim().substringBefore("=") }
            .filter { it.isNotEmpty() && re.containsMatchIn(it) }
        val arr = JSONArray()
        names.take(6).forEach { arr.put(it) }
        return JSONObject().put("logged", names.isNotEmpty()).put("hints", arr).toString()
    }

    private fun reply(cbId: String, ok: Boolean, payload: String) {
        val js = "window.__hpuDone && window.__hpuDone(" +
            JSONObject.quote(cbId) + "," + ok + "," + JSONObject.quote(payload) + ");"
        act.runOnUiThread {
            try {
                act.web.evaluateJavascript(js, null)
            } catch (_: Exception) {
            }
        }
    }
}
