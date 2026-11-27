"""深色极客风主题：配色 + 全局 QSS"""

C = {
    "bg": "#050d16",
    "bg2": "#071522",
    "panel": "#0a1a27",
    "panel2": "#0e2233",
    "line": "#1c3b4f",
    "cyan": "#5fffc8",
    "blue": "#7fe7ff",
    "purple": "#e6a8ff",
    "pink": "#ff8fc7",
    "gold": "#ffd97a",
    "danger": "#ff6f8f",
    "text": "#cdeeff",
    "dim": "#6f93a8",
}

FONT_UI = '"Microsoft YaHei UI", "Microsoft YaHei", sans-serif'
FONT_MONO = '"Cascadia Mono", "Consolas", monospace'

QSS = f"""
* {{
    font-family: {FONT_UI};
    color: {C['text']};
    outline: none;
}}
QWidget {{
    background: transparent;
}}
QMainWindow, QDialog {{
    background: {C['bg']};
}}
#Root {{
    background: qlineargradient(x1:0, y1:0, x2:0.6, y2:1,
        stop:0 #081726, stop:0.5 #061019, stop:1 #040b13);
}}
/* ---------- 侧边栏 ---------- */
#Sidebar {{
    background: rgba(4, 14, 23, 0.92);
    border-right: 1px solid {C['line']};
}}
#Brand {{
    color: {C['cyan']};
    font-size: 15px;
    font-weight: 600;
    letter-spacing: 2px;
}}
#BrandSub {{
    color: {C['dim']};
    font-size: 10px;
    letter-spacing: 1px;
}}
QPushButton#NavBtn {{
    text-align: left;
    padding: 0 16px;
    height: 42px;
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: {C['dim']};
    font-size: 13px;
    letter-spacing: 1px;
}}
QPushButton#NavBtn:hover {{
    background: rgba(95, 255, 200, 0.06);
    color: {C['text']};
}}
QPushButton#NavBtn:checked {{
    background: rgba(95, 255, 200, 0.12);
    border: 1px solid rgba(95, 255, 200, 0.45);
    color: {C['cyan']};
}}
/* ---------- 顶栏 ---------- */
#TopBar {{
    background: transparent;
    border-bottom: 1px solid rgba(28, 59, 79, 0.7);
}}
#PageTitle {{
    font-size: 19px;
    font-weight: 600;
    letter-spacing: 3px;
    color: {C['blue']};
}}
#PageSub {{
    color: {C['dim']};
    font-size: 11px;
    letter-spacing: 1px;
}}
#Clock {{
    font-family: {FONT_MONO};
    font-size: 22px;
    color: {C['cyan']};
    letter-spacing: 2px;
}}
/* ---------- 卡片 ---------- */
QFrame#Card {{
    background: rgba(10, 26, 39, 0.85);
    border: 1px solid rgba(28, 59, 79, 0.9);
    border-radius: 14px;
}}
QFrame#Tile {{
    background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
        stop:0 rgba(14, 34, 51, 0.95), stop:1 rgba(8, 22, 34, 0.95));
    border: 1px solid rgba(127, 231, 255, 0.18);
    border-radius: 14px;
}}
#CardTitle {{
    color: {C['blue']};
    font-size: 13px;
    letter-spacing: 2px;
}}
#CardHint {{
    color: {C['dim']};
    font-size: 10px;
    letter-spacing: 1px;
}}
#TileValue {{
    font-family: {FONT_MONO};
    font-size: 26px;
    color: {C['cyan']};
}}
#TileLabel {{
    color: {C['dim']};
    font-size: 11px;
    letter-spacing: 1px;
}}
/* ---------- 按钮 ---------- */
QPushButton {{
    background: rgba(95, 255, 200, 0.10);
    border: 1px solid rgba(95, 255, 200, 0.45);
    border-radius: 9px;
    color: {C['cyan']};
    padding: 6px 14px;
    font-size: 12px;
}}
QPushButton:hover {{
    background: rgba(95, 255, 200, 0.18);
}}
QPushButton:pressed {{
    background: rgba(95, 255, 200, 0.28);
}}
QPushButton#Ghost {{
    background: transparent;
    border: 1px solid rgba(127, 231, 255, 0.30);
    color: {C['blue']};
}}
QPushButton#Ghost:hover {{
    background: rgba(127, 231, 255, 0.10);
}}
QPushButton#Danger {{
    background: transparent;
    border: 1px solid rgba(255, 111, 143, 0.45);
    color: {C['danger']};
}}
QPushButton#Danger:hover {{
    background: rgba(255, 111, 143, 0.12);
}}
QPushButton#Primary {{
    background: rgba(95, 255, 200, 0.16);
    border: 1px solid {C['cyan']};
    color: #04140f;
    font-weight: 600;
    background-color: {C['cyan']};
}}
QPushButton#Primary:hover {{
    background-color: #7dffd8;
}}
/* ---------- 输入 ---------- */
QLineEdit, QComboBox, QDateEdit, QSpinBox, QDoubleSpinBox, QTimeEdit {{
    background: rgba(4, 16, 26, 0.9);
    border: 1px solid rgba(28, 59, 79, 1);
    border-radius: 8px;
    padding: 6px 10px;
    selection-background-color: rgba(95, 255, 200, 0.35);
    min-height: 20px;
}}
QLineEdit:focus, QComboBox:focus, QDateEdit:focus, QSpinBox:focus,
QDoubleSpinBox:focus, QTimeEdit:focus {{
    border: 1px solid {C['cyan']};
}}
QComboBox::drop-down {{
    border: none;
    width: 22px;
}}
QComboBox QAbstractItemView {{
    background: {C['panel2']};
    border: 1px solid {C['line']};
    selection-background-color: rgba(95, 255, 200, 0.2);
    outline: none;
}}
QSpinBox::up-button, QDoubleSpinBox::up-button,
QSpinBox::down-button, QDoubleSpinBox::down-button {{
    width: 16px;
    background: rgba(127, 231, 255, 0.10);
    border: none;
}}
/* ---------- 表格 ---------- */
QTableWidget {{
    background: rgba(6, 18, 28, 0.7);
    border: 1px solid rgba(28, 59, 79, 0.8);
    border-radius: 10px;
    gridline-color: rgba(28, 59, 79, 0.55);
    selection-background-color: rgba(95, 255, 200, 0.16);
    selection-color: {C['text']};
}}
QTableWidget::item {{
    padding: 6px;
    border: none;
}}
QHeaderView::section {{
    background: rgba(14, 34, 51, 0.95);
    color: {C['blue']};
    border: none;
    border-bottom: 1px solid {C['line']};
    padding: 8px 6px;
    font-size: 12px;
    letter-spacing: 1px;
}}
QTableCornerButton::section {{
    background: {C['panel']};
    border: none;
}}
/* ---------- 滚动条 ---------- */
QScrollBar:vertical {{
    background: transparent;
    width: 8px;
    margin: 2px;
}}
QScrollBar::handle:vertical {{
    background: rgba(95, 255, 200, 0.28);
    border-radius: 4px;
    min-height: 30px;
}}
QScrollBar::handle:vertical:hover {{
    background: rgba(95, 255, 200, 0.5);
}}
QScrollBar:horizontal {{
    background: transparent;
    height: 8px;
}}
QScrollBar::handle:horizontal {{
    background: rgba(127, 231, 255, 0.28);
    border-radius: 4px;
}}
QScrollBar::add-line, QScrollBar::sub-line {{
    width: 0; height: 0;
}}
QScrollBar::add-page, QScrollBar::sub-page {{
    background: transparent;
}}
/* ---------- 标签页 ---------- */
QTabWidget::pane {{
    border: 1px solid rgba(28, 59, 79, 0.8);
    border-radius: 10px;
    top: -1px;
}}
QTabBar::tab {{
    background: transparent;
    color: {C['dim']};
    padding: 7px 16px;
    border: 1px solid transparent;
    border-top-left-radius: 8px;
    border-top-right-radius: 8px;
}}
QTabBar::tab:selected {{
    color: {C['cyan']};
    border: 1px solid rgba(95, 255, 200, 0.4);
    border-bottom-color: transparent;
}}
/* ---------- 其它 ---------- */
QToolTip {{
    background: {C['panel2']};
    color: {C['text']};
    border: 1px solid {C['line']};
    padding: 5px;
}}
QCheckBox::indicator {{
    width: 15px; height: 15px;
    border: 1px solid {C['line']};
    border-radius: 4px;
    background: rgba(4, 16, 26, 0.9);
}}
QCheckBox::indicator:checked {{
    background: {C['cyan']};
    border: 1px solid {C['cyan']};
}}
QSplitter::handle {{
    background: rgba(28, 59, 79, 0.6);
}}
"""
