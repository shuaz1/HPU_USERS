"""账号密码本地加密：优先 Windows DPAPI（仅当前用户可解密），失败时回退 base64"""
import base64
import ctypes
from ctypes import wintypes


class _BLOB(ctypes.Structure):
    _fields_ = [("cbData", wintypes.DWORD),
                ("pbData", ctypes.POINTER(ctypes.c_char))]


def _to_blob(data: bytes):
    buf = ctypes.create_string_buffer(data, len(data))
    return _BLOB(len(data), ctypes.cast(buf, ctypes.POINTER(ctypes.c_char))), buf


def _from_blob(blob: _BLOB):
    return ctypes.string_at(blob.pbData, blob.cbData)


def encrypt(text: str) -> str:
    if not text:
        return ""
    try:
        raw = text.encode("utf-8")
        inp, _buf = _to_blob(raw)
        out = _BLOB()
        if ctypes.windll.crypt32.CryptProtectData(
                ctypes.byref(inp), None, None, None, None, 0, ctypes.byref(out)):
            data = _from_blob(out)
            ctypes.windll.kernel32.LocalFree(out.pbData)
            return "dpapi:" + base64.b64encode(data).decode()
    except Exception:
        pass
    return "b64:" + base64.b64encode(text.encode("utf-8")).decode()


def decrypt(token: str) -> str:
    if not token:
        return ""
    try:
        if token.startswith("dpapi:"):
            data = base64.b64decode(token[6:])
            inp, _buf = _to_blob(data)
            out = _BLOB()
            if ctypes.windll.crypt32.CryptUnprotectData(
                    ctypes.byref(inp), None, None, None, None, 0, ctypes.byref(out)):
                raw = _from_blob(out)
                ctypes.windll.kernel32.LocalFree(out.pbData)
                return raw.decode("utf-8")
            return ""
        if token.startswith("b64:"):
            return base64.b64decode(token[4:]).decode("utf-8")
        return token
    except Exception:
        return ""
