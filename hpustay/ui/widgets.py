"""通用控件：卡片、数据块、自绘图表、分隔线"""
from PySide6.QtCore import Qt, QRectF, QPointF
from PySide6.QtGui import (QColor, QPainter, QPen, QBrush, QFont, QPainterPath,
                           QLinearGradient)
from PySide6.QtWidgets import (QFrame, QHBoxLayout, QLabel, QPushButton,
                               QVBoxLayout, QWidget, QSizePolicy)

from ..theme import C, FONT_MONO


class Card(QFrame):
    """带标题的基础卡片"""
    def __init__(self, title="", hint="", parent=None):
        super().__init__(parent)
        self.setObjectName("Card")
        self.v = QVBoxLayout(self)
        self.v.setContentsMargins(18, 16, 18, 16)
        self.v.setSpacing(10)
        if title:
            row = QHBoxLayout()
            row.setSpacing(8)
            t = QLabel(title)
            t.setObjectName("CardTitle")
            row.addWidget(t)
            if hint:
                h = QLabel(hint)
                h.setObjectName("CardHint")
                row.addWidget(h)
            row.addStretch(1)
            self.header = row
            self.v.addLayout(row)
        else:
            self.header = None
        self.body = self.v

    def add(self, w):
        if isinstance(w, QWidget):
            self.v.addWidget(w)
        else:
            self.v.addLayout(w)
        return w


class StatTile(QFrame):
    """单值数据块"""
    def __init__(self, label, value="--", unit="", color=None, parent=None):
        super().__init__(parent)
        self.setObjectName("Tile")
        lay = QVBoxLayout(self)
        lay.setContentsMargins(16, 14, 16, 14)
        lay.setSpacing(4)
        self.lbl = QLabel(label)
        self.lbl.setObjectName("TileLabel")
        self.val = QLabel(str(value))
        self.val.setObjectName("TileValue")
        if color:
            self.val.setStyleSheet(f"color:{color};")
        row = QHBoxLayout()
        row.setSpacing(4)
        row.addWidget(self.val)
        if unit:
            u = QLabel(unit)
            u.setStyleSheet(f"color:{C['dim']}; font-size:11px; padding-bottom:5px;")
            row.addWidget(u)
        row.addStretch(1)
        lay.addWidget(self.lbl)
        lay.addLayout(row)
        self.setMinimumHeight(78)

    def set_value(self, v, color=None):
        self.val.setText(str(v))
        if color:
            self.val.setStyleSheet(f"color:{color};")


def hline():
    line = QFrame()
    line.setFixedHeight(1)
    line.setStyleSheet(f"background:{C['line']};")
    return line


class _BaseChart(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setMinimumHeight(150)
        self.setSizePolicy(QSizePolicy.Expanding, QSizePolicy.Expanding)
        self.pad_l, self.pad_r, self.pad_t, self.pad_b = 38, 16, 16, 26

    def _plot_rect(self):
        return QRectF(self.pad_l, self.pad_t,
                      max(10, self.width() - self.pad_l - self.pad_r),
                      max(10, self.height() - self.pad_t - self.pad_b))


class LineChart(_BaseChart):
    """折线图：数据为 [(标签, 数值)]"""
    def __init__(self, color=C["cyan"], parent=None):
        super().__init__(parent)
        self.data = []
        self.color = color

    def set_data(self, data, color=None):
        self.data = list(data or [])
        if color:
            self.color = color
        self.update()

    def paintEvent(self, e):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        r = self._plot_rect()
        p.fillRect(self.rect(), QColor(0, 0, 0, 0))

        # 网格
        p.setPen(QPen(QColor(28, 59, 79, 140), 1))
        for i in range(5):
            y = r.top() + r.height() * i / 4
            p.drawLine(QPointF(r.left(), y), QPointF(r.right(), y))

        if not self.data:
            p.setPen(QColor(C["dim"]))
            p.drawText(r, Qt.AlignCenter, "暂无数据")
            return

        vals = [float(v) for _, v in self.data]
        vmax = max(vals) * 1.15 if max(vals) > 0 else 1
        vmin = min(0.0, min(vals))
        span = max(vmax - vmin, 1e-6)
        n = len(vals)
        dx = r.width() / max(1, n - 1) if n > 1 else r.width()

        pts = []
        for i, v in enumerate(vals):
            x = r.left() + dx * i
            y = r.bottom() - (v - vmin) / span * r.height()
            pts.append(QPointF(x, y))

        # 区域填充
        grad = QLinearGradient(0, r.top(), 0, r.bottom())
        col = QColor(self.color)
        c1 = QColor(col); c1.setAlpha(70)
        c2 = QColor(col); c2.setAlpha(6)
        grad.setColorAt(0, c1)
        grad.setColorAt(1, c2)
        path = QPainterPath()
        path.moveTo(pts[0].x(), r.bottom())
        for pt in pts:
            path.lineTo(pt)
        path.lineTo(pts[-1].x(), r.bottom())
        p.fillPath(path, QBrush(grad))

        # 折线
        p.setPen(QPen(QColor(self.color), 2))
        for i in range(len(pts) - 1):
            p.drawLine(pts[i], pts[i + 1])

        # 数据点
        p.setBrush(QColor(self.color))
        p.setPen(QPen(QColor(255, 255, 255, 60), 1))
        for pt in pts:
            p.drawEllipse(pt, 3, 3)

        # 标签与数值
        p.setFont(QFont("Microsoft YaHei UI", 7))
        p.setPen(QColor(C["dim"]))
        step = max(1, n // 7)
        for i in range(0, n, step):
            label = str(self.data[i][0])
            tw = p.fontMetrics().horizontalAdvance(label)
            x = pts[i].x() - tw / 2
            x = max(r.left() - 20, min(r.right() - tw + 20, x))
            p.drawText(QPointF(x, self.height() - 8), label)
        p.setPen(QColor(self.color))
        for i in range(0, n, step):
            p.drawText(QPointF(pts[i].x() - 10, pts[i].y() - 8),
                       f"{vals[i]:.0f}" if abs(vals[i]) >= 10 else f"{vals[i]:.1f}")


class BarChart(_BaseChart):
    """柱状图：数据为 [(标签, 数值)]"""
    def __init__(self, color=C["blue"], parent=None):
        super().__init__(parent)
        self.data = []
        self.color = color

    def set_data(self, data, color=None):
        self.data = list(data or [])
        if color:
            self.color = color
        self.update()

    def paintEvent(self, e):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        r = self._plot_rect()
        p.setPen(QPen(QColor(28, 59, 79, 140), 1))
        for i in range(5):
            y = r.top() + r.height() * i / 4
            p.drawLine(QPointF(r.left(), y), QPointF(r.right(), y))

        if not self.data:
            p.setPen(QColor(C["dim"]))
            p.drawText(r, Qt.AlignCenter, "暂无数据")
            return

        vals = [float(v) for _, v in self.data]
        vmax = max(vals) if max(vals) > 0 else 1
        n = len(vals)
        gap = 10
        bw = max(6.0, (r.width() - gap * (n - 1)) / max(1, n))

        p.setFont(QFont("Microsoft YaHei UI", 7))
        for i, (label, v) in enumerate(self.data):
            h = (float(v) / vmax) * r.height()
            x = r.left() + i * (bw + gap)
            bar = QRectF(x, r.bottom() - h, bw, h)
            grad = QLinearGradient(0, bar.top(), 0, bar.bottom())
            c1 = QColor(self.color)
            c2 = QColor(self.color); c2.setAlpha(90)
            grad.setColorAt(0, c1)
            grad.setColorAt(1, c2)
            p.setPen(Qt.NoPen)
            p.setBrush(QBrush(grad))
            p.drawRoundedRect(bar, 3, 3)
            p.setPen(QColor(self.color))
            p.drawText(QRectF(x, bar.top() - 14, bw, 12),
                       Qt.AlignCenter, f"{float(v):.0f}")
            p.setPen(QColor(C["dim"]))
            p.drawText(QRectF(x - 6, r.bottom() + 4, bw + 12, 16),
                       Qt.AlignCenter, str(label)[:4])


class RingStat(QWidget):
    """环形进度（用于可视化占比）"""
    def __init__(self, color=C["cyan"], parent=None):
        super().__init__(parent)
        self.value = 0.0
        self.text = ""
        self.caption = ""
        self.color = color
        self.setMinimumSize(96, 96)

    def set_value(self, value, text="", caption=""):
        self.value = max(0.0, min(1.0, value))
        self.text = text
        self.caption = caption
        self.update()

    def paintEvent(self, e):
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        size = min(self.width(), self.height())
        rect = QRectF((self.width() - size) / 2 + 6, (self.height() - size) / 2 + 6,
                      size - 12, size - 12)
        p.setPen(QPen(QColor(28, 59, 79, 180), 6))
        p.drawArc(rect, 0, 360 * 16)
        p.setPen(QPen(QColor(self.color), 6))
        p.drawArc(rect, 90 * 16, -int(360 * 16 * self.value))
        if self.text:
            f = QFont("Cascadia Mono", 10)
            p.setFont(f)
            p.setPen(QColor(C["text"]))
            p.drawText(rect, Qt.AlignCenter, self.text)
        if self.caption:
            p.setFont(QFont("Microsoft YaHei UI", 7))
            p.setPen(QColor(C["dim"]))
            p.drawText(QRectF(rect.left(), rect.center().y() + 12, rect.width(), 16),
                       Qt.AlignCenter, self.caption)


class ClickableLabel(QLabel):
    def __init__(self, text="", parent=None):
        super().__init__(text, parent)
        self.setCursor(Qt.PointingHandCursor)
