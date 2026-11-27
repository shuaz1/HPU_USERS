package cn.hpu.suishouce

import android.webkit.CookieManager
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.nio.charset.Charset

/**
 * 极简 HTTP 客户端：只用系统自带的 HttpURLConnection，不引第三方库。
 * 关键点是和 WebView 的 CookieManager 共用同一份 cookie，
 * 这样用户在应用内登录过一次教务，后面的成绩/电费请求都自动带上会话。
 */
object Http {

    const val DESKTOP_UA =
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    fun request(
        url: String,
        method: String = "GET",
        body: String? = null,
        ua: String? = null,
        referer: String? = null
    ): JSONObject {
        var current = url
        var verb = method.uppercase()
        var payload = body
        var lastStatus = 0

        for (hop in 0 until 6) {
            var conn: HttpURLConnection? = null
            try {
                conn = URL(current).openConnection() as HttpURLConnection
                conn.connectTimeout = 12000
                conn.readTimeout = 25000
                conn.instanceFollowRedirects = false
                conn.requestMethod = verb
                conn.setRequestProperty("User-Agent", ua ?: DESKTOP_UA)
                conn.setRequestProperty("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
                conn.setRequestProperty("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.6")
                if (referer != null) conn.setRequestProperty("Referer", referer)

                val cookie = CookieManager.getInstance().getCookie(current)
                if (!cookie.isNullOrEmpty()) conn.setRequestProperty("Cookie", cookie)

                val sent: ByteArray? = if (verb == "GET") null else payload?.toByteArray(Charsets.UTF_8)
                if (sent != null) {
                    conn.doOutput = true
                    conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                    conn.outputStream.use { it.write(sent) }
                }

                lastStatus = conn.responseCode
                saveCookies(current, conn)

                if (lastStatus in 300..399) {
                    val loc = conn.getHeaderField("Location") ?: ""
                    conn.disconnect()
                    if (loc.isEmpty()) break
                    current = URL(URL(current), loc).toString()
                    if (lastStatus == 303) { verb = "GET"; payload = null }
                    continue
                }

                val stream = if (lastStatus >= 400) conn.errorStream else conn.inputStream
                val bytes = stream?.use { it.readBytes() } ?: ByteArray(0)
                conn.disconnect()
                return JSONObject()
                    .put("status", lastStatus)
                    .put("location", current)
                    .put("body", decode(bytes))
            } catch (e: Exception) {
                try { conn?.disconnect() } catch (_: Exception) { }
                return JSONObject()
                    .put("status", lastStatus)
                    .put("location", current)
                    .put("body", "")
                    .put("err", e.message ?: e.javaClass.simpleName)
            }
        }

        return JSONObject().put("status", lastStatus).put("location", current).put("body", "")
    }

    /** 把响应的 Set-Cookie 写回 WebView 的 cookie 池，保持两边一致 */
    private fun saveCookies(url: String, conn: HttpURLConnection) {
        try {
            val cm = CookieManager.getInstance()
            for ((name, values) in conn.headerFields) {
                if (name == null) continue
                if (!name.equals("Set-Cookie", ignoreCase = true)) continue
                for (v in values) {
                    val kv = v.substringBefore(";").trim()
                    if (kv.isEmpty()) continue
                    cm.setCookie(url, kv)
                }
            }
            cm.flush()
        } catch (_: Exception) { }
    }

    /**
     * 学校站点编码不统一：电费站 Default.aspx 是 GBK，记录页是 UTF-8。
     * 先按 UTF-8 严格解，出现替换字符再回退 GBK。
     */
    private fun decode(bytes: ByteArray): String {
        val utf8 = String(bytes, Charsets.UTF_8)
        if (utf8.indexOf('\uFFFD') < 0) return utf8
        return try { String(bytes, Charset.forName("GBK")) } catch (_: Exception) { utf8 }
    }
}
