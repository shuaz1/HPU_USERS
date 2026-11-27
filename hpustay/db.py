"""本地数据库层：SQLite 存储课表、成绩、图书馆、电费、倒计时、报修、设置"""
import os
import sqlite3
import datetime as dt

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(APP_DIR, "data")

SCHEMA = """
CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    teacher TEXT DEFAULT '',
    room TEXT DEFAULT '',
    weekday INTEGER NOT NULL,          -- 1=周一 ... 7=周日
    start_p INTEGER NOT NULL,          -- 第几节开始
    end_p INTEGER NOT NULL,            -- 第几节结束
    week_type TEXT DEFAULT 'all',      -- all / odd / even
    color TEXT DEFAULT '#5fffc8'
);

CREATE TABLE IF NOT EXISTS grades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    term TEXT NOT NULL,
    name TEXT NOT NULL,
    credit REAL DEFAULT 0,
    score REAL DEFAULT 0,
    gtype TEXT DEFAULT '必修'
);

CREATE TABLE IF NOT EXISTS library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    venue TEXT NOT NULL,
    seat TEXT DEFAULT '',
    date TEXT NOT NULL,
    start_t TEXT DEFAULT '',
    end_t TEXT DEFAULT '',
    status TEXT DEFAULT '已预约',
    note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS power (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    kind TEXT DEFAULT 'consume',       -- consume / recharge
    amount REAL NOT NULL,
    balance_after REAL DEFAULT 0,
    note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS countdown (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    color TEXT DEFAULT '#7fe7ff'
);

CREATE TABLE IF NOT EXISTS repairs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    dorm TEXT DEFAULT '',
    date TEXT NOT NULL,
    status TEXT DEFAULT '待处理',
    note TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""

DEFAULT_SETTINGS = {
    "student_name": "",
    "student_no": "",
    "school": "河南理工大学",
    "term_start": "",
    "gpa_mode": "4.0",
    "power_low": "30",
    "power_balance": "0",
    "url_jw": "",
    "url_lib": "",
    "url_power": "",
    "login_user": "",
    "login_pass": "",
    "auto_sync": "0",
}


class Database:
    def __init__(self, path=None):
        os.makedirs(DATA_DIR, exist_ok=True)
        self.path = path or os.path.join(DATA_DIR, "campus.db")
        self.conn = sqlite3.connect(self.path)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self._defaults()

    def _defaults(self):
        for k, v in DEFAULT_SETTINGS.items():
            self.conn.execute(
                "INSERT OR IGNORE INTO settings(key, value) VALUES(?, ?)", (k, v))
        self.conn.commit()

    # ---------------- 设置 ----------------
    def get(self, key, default=""):
        row = self.conn.execute(
            "SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row and row["value"] is not None else default

    def set(self, key, value):
        self.conn.execute(
            "INSERT INTO settings(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
            (key, str(value)))
        self.conn.commit()

    # ---------------- 课程 ----------------
    def add_course(self, name, teacher, room, weekday, start_p, end_p,
                   week_type="all", color="#5fffc8"):
        self.conn.execute(
            "INSERT INTO courses(name, teacher, room, weekday, start_p, end_p, week_type, color) "
            "VALUES(?,?,?,?,?,?,?,?)",
            (name, teacher, room, weekday, start_p, end_p, week_type, color))
        self.conn.commit()

    def courses(self, week_parity=None):
        rows = self.conn.execute(
            "SELECT * FROM courses ORDER BY weekday, start_p").fetchall()
        if week_parity in ("odd", "even"):
            rows = [r for r in rows
                    if r["week_type"] in ("all", week_parity)]
        return rows

    def delete_course(self, cid):
        self.conn.execute("DELETE FROM courses WHERE id=?", (cid,))
        self.conn.commit()

    # ---------------- 成绩 ----------------
    def add_grade(self, term, name, credit, score, gtype):
        self.conn.execute(
            "INSERT INTO grades(term, name, credit, score, gtype) VALUES(?,?,?,?,?)",
            (term, name, float(credit), float(score), gtype))
        self.conn.commit()

    def grades(self, term=None):
        if term and term != "全部":
            rows = self.conn.execute(
                "SELECT * FROM grades WHERE term=? ORDER BY id", (term,)).fetchall()
        else:
            rows = self.conn.execute("SELECT * FROM grades ORDER BY term, id").fetchall()
        return rows

    def terms(self):
        rows = self.conn.execute(
            "SELECT DISTINCT term FROM grades ORDER BY term DESC").fetchall()
        return [r["term"] for r in rows]

    def delete_grade(self, gid):
        self.conn.execute("DELETE FROM grades WHERE id=?", (gid,))
        self.conn.commit()

    # ---------------- 图书馆 ----------------
    def add_library(self, venue, seat, date, start_t, end_t, status="已预约", note=""):
        self.conn.execute(
            "INSERT INTO library(venue, seat, date, start_t, end_t, status, note) "
            "VALUES(?,?,?,?,?,?,?)",
            (venue, seat, date, start_t, end_t, status, note))
        self.conn.commit()

    def library(self):
        return self.conn.execute(
            "SELECT * FROM library ORDER BY date DESC, start_t").fetchall()

    def update_library_status(self, lid, status):
        self.conn.execute("UPDATE library SET status=? WHERE id=?", (status, lid))
        self.conn.commit()

    def delete_library(self, lid):
        self.conn.execute("DELETE FROM library WHERE id=?", (lid,))
        self.conn.commit()

    # ---------------- 电费 ----------------
    def add_power(self, date, kind, amount, balance_after=0, note=""):
        self.conn.execute(
            "INSERT INTO power(date, kind, amount, balance_after, note) VALUES(?,?,?,?,?)",
            (date, kind, float(amount), float(balance_after), note))
        self.conn.commit()

    def power(self):
        return self.conn.execute("SELECT * FROM power ORDER BY date, id").fetchall()

    def delete_power(self, pid):
        self.conn.execute("DELETE FROM power WHERE id=?", (pid,))
        self.conn.commit()

    def power_balance(self):
        try:
            return float(self.get("power_balance", "0") or 0)
        except ValueError:
            return 0.0

    def power_daily_avg(self, days=7):
        rows = self.conn.execute(
            "SELECT date, kind, amount FROM power ORDER BY date").fetchall()
        consume = {}
        for r in rows:
            if r["kind"] == "consume":
                consume[r["date"]] = consume.get(r["date"], 0) + float(r["amount"])
        if not consume:
            return 0.0, 0
        recent = sorted(consume.items())[-days:]
        total = sum(v for _, v in recent)
        n = len(recent)
        return (total / n if n else 0.0), n

    # ---------------- 倒计时 ----------------
    def add_countdown(self, title, date, color="#7fe7ff"):
        self.conn.execute(
            "INSERT INTO countdown(title, date, color) VALUES(?,?,?)",
            (title, date, color))
        self.conn.commit()

    def countdowns(self):
        return self.conn.execute("SELECT * FROM countdown ORDER BY date").fetchall()

    def delete_countdown(self, cid):
        self.conn.execute("DELETE FROM countdown WHERE id=?", (cid,))
        self.conn.commit()

    # ---------------- 报修 ----------------
    def add_repair(self, title, dorm, date, status="待处理", note=""):
        self.conn.execute(
            "INSERT INTO repairs(title, dorm, date, status, note) VALUES(?,?,?,?,?)",
            (title, dorm, date, status, note))
        self.conn.commit()

    def repairs(self):
        return self.conn.execute("SELECT * FROM repairs ORDER BY date DESC").fetchall()

    def update_repair_status(self, rid, status):
        self.conn.execute("UPDATE repairs SET status=? WHERE id=?", (status, rid))
        self.conn.commit()

    def delete_repair(self, rid):
        self.conn.execute("DELETE FROM repairs WHERE id=?", (rid,))
        self.conn.commit()

    # ---------------- 学期周次 ----------------
    def term_start(self):
        """返回学期开始日期（周一），未设置时按今天回退到本周一"""
        value = self.get("term_start", "")
        if value:
            try:
                d = dt.date.fromisoformat(value)
                return d - dt.timedelta(days=d.weekday())
            except ValueError:
                pass
        today = dt.date.today()
        return today - dt.timedelta(days=today.weekday())

    def current_week(self):
        start = self.term_start()
        delta = (dt.date.today() - start).days
        return max(1, delta // 7 + 1)

    def close(self):
        self.conn.close()
