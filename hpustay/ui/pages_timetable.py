"""课程表页：周视图网格 + 添加/删除课程"""
import datetime as dt

from PySide6.QtCore import Qt
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (QComboBox, QDialog, QDialogButtonBox, QFrame,
                               QGridLayout, QHBoxLayout, QLabel, QLineEdit,
                               QMenu, QPushButton, QSpinBox, QVBoxLayout,
                               QWidget)

from ..db import Database
from ..theme import C
from .widgets import Card, hline

PERIODS = [
    ("1", "08:00-08:45"), ("2", "08:55-09:40"),
    ("3", "10:00-10:45"), ("4", "10:55-11:40"),
    ("5", "14:30-15:15"), ("6", "15:25-16:10"),
    ("7", "16:30-17:15"), ("8", "17:25-18:10"),
    ("9", "19:00-19:45"), ("10", "19:55-20:40"),
]
WEEK_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"]
COLORS = ["#5fffc8", "#7fe7ff", "#e6a8ff", "#ff8fc7", "#ffd97a", "#9ae66e", "#ffa26b"]


class CourseDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("添加课程")
        self.setMinimumWidth(380)
        v = QVBoxLayout(self)
        v.setContentsMargins(22, 20, 22, 18)
        v.setSpacing(12)

        title = QLabel("新建课程")
        title.setObjectName("PageTitle")
        v.addWidget(title)

        self.name = QLineEdit(); self.name.setPlaceholderText("课程名称，如 数据结构")
        self.teacher = QLineEdit(); self.teacher.setPlaceholderText("任课教师（可空）")
        self.room = QLineEdit(); self.room.setPlaceholderText("上课教室，如 三教 302")

        row1 = QHBoxLayout(); row1.setSpacing(10)
        self.weekday = QComboBox()
        for i, n in enumerate(WEEK_NAMES, start=1):
            self.weekday.addItem(n, i)
        self.week_type = QComboBox()
        self.week_type.addItem("每周", "all")
        self.week_type.addItem("单周", "odd")
        self.week_type.addItem("双周", "even")
        row1.addWidget(QLabel("星期"))
        row1.addWidget(self.weekday, 1)
        row1.addWidget(QLabel("周次"))
        row1.addWidget(self.week_type, 1)

        row2 = QHBoxLayout(); row2.setSpacing(10)
        self.start_p = QSpinBox(); self.start_p.setRange(1, len(PERIODS)); self.start_p.setValue(1)
        self.end_p = QSpinBox(); self.end_p.setRange(1, len(PERIODS)); self.end_p.setValue(2)
        self.color = QComboBox()
        for c in COLORS:
            self.color.addItem(c, c)
        row2.addWidget(QLabel("起始节"))
        row2.addWidget(self.start_p)
        row2.addWidget(QLabel("结束节"))
        row2.addWidget(self.end_p)
        row2.addWidget(QLabel("颜色"))
        row2.addWidget(self.color, 1)

        for w in (self.name,):
            v.addWidget(QLabel("课程名称")); v.addWidget(w)
        v.addWidget(QLabel("教师 / 教室"))
        v.addWidget(self.teacher); v.addWidget(self.room)
        v.addWidget(hline())
        v.addLayout(row1); v.addLayout(row2)

        bb = QDialogButtonBox(QDialogButtonBox.Ok | QDialogButtonBox.Cancel)
        bb.button(QDialogButtonBox.Ok).setText("添加")
        bb.button(QDialogButtonBox.Cancel).setText("取消")
        bb.button(QDialogButtonBox.Ok).setObjectName("Primary")
        bb.accepted.connect(self.accept)
        bb.rejected.connect(self.reject)
        v.addWidget(bb)

    def values(self):
        return dict(
            name=self.name.text().strip(),
            teacher=self.teacher.text().strip(),
            room=self.room.text().strip(),
            weekday=self.weekday.currentData(),
            start_p=self.start_p.value(),
            end_p=max(self.start_p.value(), self.end_p.value()),
            week_type=self.week_type.currentData(),
            color=self.color.currentData(),
        )


class CourseBlock(QFrame):
    def __init__(self, course, page, parent=None):
        super().__init__(parent)
        self.course = course
        self.page = page
        col = QColor(course["color"])
        bg = f"rgba({col.red()},{col.green()},{col.blue()},0.13)"
        self.setStyleSheet(
            f"QFrame{{background:{bg}; border:1px solid rgba({col.red()},{col.green()},{col.blue()},0.55);"
            f"border-left:3px solid {course['color']}; border-radius:8px;}}"
        )
        v = QVBoxLayout(self)
        v.setContentsMargins(8, 5, 6, 5)
        v.setSpacing(1)
        name = QLabel(course["name"])
        name.setWordWrap(True)
        name.setStyleSheet(f"color:{course['color']}; font-size:11px; font-weight:600; border:none;")
        v.addWidget(name)
        info = " / ".join(x for x in (course["room"], course["teacher"]) if x)
        if info:
            lbl = QLabel(info)
            lbl.setWordWrap(True)
            lbl.setStyleSheet(f"color:{C['dim']}; font-size:9px; border:none;")
            v.addWidget(lbl)
        v.addStretch(1)
        self.setToolTip(f"{course['name']}\n{info or '—'}\n"
                        f"{WEEK_NAMES[course['weekday']-1]} 第{course['start_p']}-{course['end_p']}节"
                        f"（{'单周' if course['week_type']=='odd' else '双周' if course['week_type']=='even' else '每周'}）")
        self.setCursor(Qt.PointingHandCursor)

    def contextMenuEvent(self, e):
        menu = QMenu(self)
        menu.setStyleSheet(f"QMenu{{background:{C['panel2']}; border:1px solid {C['line']};}}"
                           f"QMenu::item{{padding:6px 18px;}}"
                           f"QMenu::item:selected{{background:rgba(95,255,200,0.16);}}")
        act = menu.addAction("删除这门课")
        act.triggered.connect(lambda: self.page.delete_course(self.course["id"]))
        menu.exec(e.globalPos())


class TimetablePage(QWidget):
    def __init__(self, db: Database, parent=None):
        super().__init__(parent)
        self.db = db
        v = QVBoxLayout(self)
        v.setContentsMargins(24, 18, 24, 20)
        v.setSpacing(14)

        bar = QHBoxLayout()
        bar.setSpacing(10)
        self.week_label = QLabel()
        self.week_label.setStyleSheet(f"color:{C['blue']}; font-size:13px; letter-spacing:1px;")
        self.week_spin = QSpinBox()
        self.week_spin.setRange(1, 30)
        self.week_spin.valueChanged.connect(self._rebuild)
        btn_cur = QPushButton("回到本周")
        btn_cur.setObjectName("Ghost")
        btn_cur.clicked.connect(self.go_current)
        self.parity = QComboBox()
        self.parity.addItem("全部", "all")
        self.parity.addItem("只看单周", "odd")
        self.parity.addItem("只看双周", "even")
        self.parity.currentIndexChanged.connect(self._rebuild)
        btn_add = QPushButton("+ 添加课程")
        btn_add.clicked.connect(self.add_course)

        bar.addWidget(self.week_label)
        bar.addWidget(self.week_spin)
        bar.addWidget(btn_cur)
        bar.addSpacing(8)
        bar.addWidget(self.parity)
        bar.addStretch(1)
        bar.addWidget(btn_add)
        v.addLayout(bar)

        card = Card()
        self.grid = QGridLayout()
        self.grid.setContentsMargins(12, 12, 12, 12)
        self.grid.setSpacing(6)
        card.add(self.grid)
        card.setSizePolicy(card.sizePolicy().Expanding, card.sizePolicy().Expanding)
        v.addWidget(card, 1)

        tip = QLabel("提示：右键点击课块可删除该课程；单双周课程会自动按当前选择的周次过滤。")
        tip.setObjectName("CardHint")
        v.addWidget(tip)

        self.go_current()

    # ---------------- 数据/渲染 ----------------
    def go_current(self):
        self.week_spin.setValue(self.db.current_week())

    def reload(self):
        self._rebuild()

    def _clear_grid(self):
        while self.grid.count():
            item = self.grid.takeAt(0)
            w = item.widget()
            if w:
                w.deleteLater()

    def _rebuild(self):
        self._clear_grid()
        week = self.week_spin.value()
        parity = self.parity.currentData()
        start = self.db.term_start()
        monday = start + dt.timedelta(weeks=week - 1)
        self.week_label.setText(f"第 {week} 周 · {monday.isoformat()}")
        today = dt.date.today()
        today_col = today.weekday() if start <= today < start + dt.timedelta(weeks=40) else -1

        # 表头
        head = QLabel("节次")
        head.setAlignment(Qt.AlignCenter)
        head.setStyleSheet(f"color:{C['dim']}; font-size:10px; padding:6px;")
        self.grid.addWidget(head, 0, 0)
        for i in range(7):
            d = monday + dt.timedelta(days=i)
            lbl = QLabel(f"{WEEK_NAMES[i]}\n{d.month}/{d.day}")
            lbl.setAlignment(Qt.AlignCenter)
            if i == today_col:
                lbl.setStyleSheet(
                    f"color:{C['cyan']}; font-size:11px; font-weight:600; padding:6px;"
                    f"background:rgba(95,255,200,0.10); border-radius:8px;")
            else:
                lbl.setStyleSheet(f"color:{C['blue']}; font-size:11px; padding:6px;")
            self.grid.addWidget(lbl, 0, i + 1)

        # 节次列
        for p, (label, time_range) in enumerate(PERIODS, start=1):
            cell = QLabel(f"{label}\n{time_range}")
            cell.setAlignment(Qt.AlignCenter)
            cell.setStyleSheet(f"color:{C['dim']}; font-size:9px; border:none;")
            cell.setFixedWidth(66)
            self.grid.addWidget(cell, p, 0)

        for i in range(7):
            self.grid.setColumnStretch(i + 1, 1)
        for p in range(1, len(PERIODS) + 1):
            self.grid.setRowStretch(p, 1)

        # 课程
        occupied = set()
        for course in self.db.courses(parity):
            wd = course["weekday"]
            s, e = course["start_p"], course["end_p"]
            span = e - s + 1
            key = (wd, s)
            if key in occupied:
                continue
            occupied.add(key)
            block = CourseBlock(course, self)
            block.setMinimumHeight(46)
            self.grid.addWidget(block, s, wd, span, 1)

    # ---------------- 操作 ----------------
    def add_course(self):
        dlg = CourseDialog(self)
        if dlg.exec() != QDialog.Accepted:
            return
        vals = dlg.values()
        if not vals["name"]:
            return
        self.db.add_course(**vals)
        self._rebuild()

    def delete_course(self, cid):
        self.db.delete_course(cid)
        self._rebuild()
