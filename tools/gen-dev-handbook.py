# -*- coding: utf-8 -*-
"""生成《理工随身册 开发与维护手册》Word 文档（v1.1.2 基线）。"""
import os
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.section import WD_SECTION
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '理工随身册-开发与维护手册.docx')

CN_BODY = '宋体'
CN_HEAD = '黑体'
CN_KAI = '楷体'
EN = 'Times New Roman'


def set_font(run, cn=CN_BODY, size=12, bold=False, color=(0, 0, 0), en=EN):
    run.font.name = en
    run.font.size = Pt(size)
    run.font.bold = bold
    run.font.color.rgb = RGBColor(*color)
    rpr = run._element.get_or_add_rPr()
    rf = rpr.find(qn('w:rFonts'))
    if rf is None:
        rf = OxmlElement('w:rFonts')
        rpr.append(rf)
    rf.set(qn('w:eastAsia'), cn)
    rf.set(qn('w:ascii'), en)
    rf.set(qn('w:hAnsi'), en)


def style_init(doc):
    st = doc.styles['Normal']
    st.font.name = EN
    st.font.size = Pt(12)
    st.font.color.rgb = RGBColor(0, 0, 0)
    st.element.rPr.rFonts.set(qn('w:eastAsia'), CN_BODY)
    pf = st.paragraph_format
    pf.line_spacing = 1.5
    pf.first_line_indent = Pt(24)
    pf.space_before = Pt(0)
    pf.space_after = Pt(0)
    pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY

    spec = {
        'Heading 1': (16, 14, 6),
        'Heading 2': (14, 11, 5),
        'Heading 3': (12, 9, 4),
    }
    for name, (size, before, after) in spec.items():
        s = doc.styles[name]
        s.font.name = EN
        s.font.size = Pt(size)
        s.font.bold = True
        s.font.color.rgb = RGBColor(0, 0, 0)
        s.element.rPr.rFonts.set(qn('w:eastAsia'), CN_HEAD)
        s.paragraph_format.space_before = Pt(before)
        s.paragraph_format.space_after = Pt(after)
        s.paragraph_format.first_line_indent = Pt(0)
        s.paragraph_format.line_spacing = 1.5
        s.paragraph_format.keep_with_next = True
        s.paragraph_format.alignment = WD_ALIGN_PARAGRAPH.LEFT


def h(doc, text, level):
    p = doc.add_heading(text, level=level)
    for r in p.runs:
        set_font(r, CN_HEAD, {1: 16, 2: 14, 3: 12}[level], True)
    return p


def body(doc, text, indent=True):
    p = doc.add_paragraph()
    if not indent:
        p.paragraph_format.first_line_indent = Pt(0)
    r = p.add_run(text)
    set_font(r, CN_BODY, 12)
    return p


def bullet(doc, text):
    p = doc.add_paragraph(style='List Bullet')
    p.paragraph_format.first_line_indent = Pt(0)
    p.paragraph_format.left_indent = Pt(24)
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(2)
    r = p.add_run(text)
    set_font(r, CN_BODY, 12)
    return p


def caption(doc, text, before=4, after=4):
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.first_line_indent = Pt(0)
    p.paragraph_format.space_before = Pt(before)
    p.paragraph_format.space_after = Pt(after)
    p.paragraph_format.line_spacing = 1.0
    p.paragraph_format.keep_with_next = True
    r = p.add_run(text)
    set_font(r, CN_BODY, 10.5)
    return p


def shade(cell, color='D9D9D9'):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), color)
    tcPr.append(shd)


def vcenter(cell):
    tcPr = cell._tc.get_or_add_tcPr()
    va = OxmlElement('w:vAlign')
    va.set(qn('w:val'), 'center')
    tcPr.append(va)


def row_props(row, header=False):
    trPr = row._tr.get_or_add_trPr()
    cant = OxmlElement('w:cantSplit')
    trPr.append(cant)
    if header:
        th = OxmlElement('w:tblHeader')
        trPr.append(th)


def add_table(doc, cap, headers, rows, aligns=None, widths=None):
    caption(doc, cap)
    t = doc.add_table(rows=1, cols=len(headers))
    t.style = 'Table Grid'
    t.alignment = WD_TABLE_ALIGNMENT.CENTER
    t.autofit = False
    aligns = aligns or (['center'] + ['left'] * (len(headers) - 1))
    if widths:
        for i, w in enumerate(widths):
            for c in t.columns[i].cells:
                c.width = Cm(w)
    hdr = t.rows[0]
    row_props(hdr, header=True)
    for i, text in enumerate(headers):
        cell = hdr.cells[i]
        shade(cell)
        vcenter(cell)
        p = cell.paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.first_line_indent = Pt(0)
        p.paragraph_format.line_spacing = 1.0
        p.paragraph_format.space_before = Pt(0)
        p.paragraph_format.space_after = Pt(0)
        r = p.add_run(text)
        set_font(r, CN_HEAD, 10.5, True)
    for data in rows:
        row = t.add_row()
        row_props(row)
        for i, val in enumerate(data):
            cell = row.cells[i]
            vcenter(cell)
            p = cell.paragraphs[0]
            p.paragraph_format.first_line_indent = Pt(0)
            p.paragraph_format.line_spacing = 1.0
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(0)
            a = aligns[i]
            p.alignment = {'center': WD_ALIGN_PARAGRAPH.CENTER,
                           'left': WD_ALIGN_PARAGRAPH.LEFT,
                           'right': WD_ALIGN_PARAGRAPH.RIGHT}[a]
            r = p.add_run(str(val))
            set_font(r, CN_BODY, 10.5)
    # 表后留一点距离
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(0)
    p.paragraph_format.space_after = Pt(6)
    p.paragraph_format.first_line_indent = Pt(0)
    return t


def field(paragraph, instr):
    r = paragraph.add_run()
    fld = OxmlElement('w:fldSimple')
    fld.set(qn('w:instr'), instr)
    paragraph._p.append(fld)
    return r


def add_page_number_footer(section):
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0]
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.first_line_indent = Pt(0)
    run = p.add_run()
    fld = OxmlElement('w:fldChar')
    fld.set(qn('w:fldCharType'), 'begin')
    run._r.append(fld)
    it = OxmlElement('w:instrText')
    it.set(qn('xml:space'), 'preserve')
    it.text = ' PAGE '
    run._r.append(it)
    sep = OxmlElement('w:fldChar')
    sep.set(qn('w:fldCharType'), 'separate')
    run._r.append(sep)
    t = OxmlElement('w:t')
    t.text = '1'
    run._r.append(t)
    end = OxmlElement('w:fldChar')
    end.set(qn('w:fldCharType'), 'end')
    run._r.append(end)
    set_font(run, CN_BODY, 10.5)


def restart_numbering(section):
    sectPr = section._sectPr
    pg = OxmlElement('w:pgNumType')
    pg.set(qn('w:start'), '1')
    sectPr.append(pg)


doc = Document()
style_init(doc)

sec = doc.sections[0]
sec.page_width = Cm(21)
sec.page_height = Cm(29.7)
sec.top_margin = Cm(2.5)
sec.bottom_margin = Cm(2.5)
sec.left_margin = Cm(2.5)
sec.right_margin = Cm(2.5)

# ---------------- 封面 ----------------
p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(150)
p.paragraph_format.first_line_indent = Pt(0)
r = p.add_run('理工随身册')
set_font(r, CN_HEAD, 26, True)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(10)
p.paragraph_format.first_line_indent = Pt(0)
r = p.add_run('开发与维护手册')
set_font(r, CN_HEAD, 22, True)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(28)
p.paragraph_format.first_line_indent = Pt(0)
r = p.add_run('单文件原型 · 安卓壳 · GitHub Actions 自动发版')
set_font(r, CN_KAI, 12)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(120)
p.paragraph_format.first_line_indent = Pt(0)
r = p.add_run('基线版本 v1.1.2（versionCode 13）')
set_font(r, CN_KAI, 12)

p = doc.add_paragraph()
p.alignment = WD_ALIGN_PARAGRAPH.CENTER
p.paragraph_format.space_before = Pt(8)
p.paragraph_format.first_line_indent = Pt(0)
r = p.add_run('刷子制作　2026 年 11 月 28 日')
set_font(r, CN_KAI, 12)

# ---------------- 文档信息 + 目录 ----------------
doc.add_page_break()
h(doc, '文档信息', 1)
add_table(doc, '表 1　文档与代码基线',
          ['项目', '内容'],
          [['文档名称', '理工随身册 开发与维护手册'],
           ['适用应用', '理工随身册（包名 cn.hpu.suishouce）'],
           ['代码基线', 'master 分支提交 f22c30f，tag v1.1.2'],
           ['文档用途', '日常维护、版本升级、二次开发与故障排查'],
           ['读者对象', '作者本人及后续接手者'],
           ['维护方式', '随大版本更新，修改后同步升文档版本']],
          aligns=['center', 'left'], widths=[4.0, 12.0])

h(doc, '目录', 1)
toc_p = doc.add_paragraph()
toc_p.paragraph_format.first_line_indent = Pt(0)
field(toc_p, 'TOC \\o "1-2" \\h \\z \\u')

# ---------------- 正文 ----------------
new = doc.add_section(WD_SECTION.NEW_PAGE)
new.page_width = Cm(21)
new.page_height = Cm(29.7)
new.top_margin = Cm(2.5)
new.bottom_margin = Cm(2.5)
new.left_margin = Cm(2.5)
new.right_margin = Cm(2.5)
restart_numbering(new)
add_page_number_footer(new)
doc.sections[0].footer.is_linked_to_previous = False

h(doc, '1 文档说明', 1)
h(doc, '1.1 编写目的', 2)
body(doc, '这份手册把「理工随身册」从原型到安装包的完整链路固定下来，目的是让后续的每一次升级都不依赖记忆：改动落在哪个文件、版本号要同步几处、tag 怎么打、包从哪里取、出问题先查哪一层，都能在文档里直接查到。')
body(doc, '手册同时承担二次开发的说明书作用。原型是单文件 H5，没有框架、没有构建步骤，改动门槛低但约束多；把这些约束写清楚，比事后从代码里反推要省事得多。')

h(doc, '1.2 适用读者与阅读方式', 2)
body(doc, '读者默认具备基本的 Git 与 Node 使用能力，能读懂 JavaScript 和 Kotlin，但不要求有安卓开发经验。全文按任务组织：第 2、3 章建立整体认识，第 4 章讲发版，第 5 章逐个功能说明实现，第 6 章列边界，第 7 章讲怎么改，第 8 章排错，附录供速查。')
body(doc, '只需要发一版新包时，直接跳到 4.4 的步骤表；想加功能，先读第 7 章的约束再动手。')

h(doc, '1.3 术语约定', 2)
add_table(doc, '表 2　术语表',
          ['术语', '含义'],
          [['原型', '手机端原型.html，单文件 H5，界面与业务逻辑的唯一来源'],
           ['壳', '包在原型外层的原生容器，分桌面 Electron 壳与安卓 WebView 壳两种'],
           ['桥', 'android/bridge 下的 JS，被注入页面，向原型暴露 window.hpu'],
           ['契约', '课表 JSON 的字段约定，见 5.4 与仓库内《课表数据契约v1.md》'],
           ['PT', '节次时间表，冬季与夏季两套，见 5.6'],
           ['连堂', '同一门课连续占用两节以上，解析时表现为 p2 大于 p1'],
           ['周次', '课程生效的教学周集合，支持区间、离散值、单双周']],
          aligns=['center', 'left'], widths=[3.0, 13.0])

h(doc, '2 项目概览', 1)
h(doc, '2.1 产品定位与边界', 2)
body(doc, '这个应用的定位始终是「自用工具」，不是对外产品。所有设计取舍都服从这一点：不做上架，最多通过 GitHub Release 分发；不依赖 VPN；尽量向下兼容到 Android 5；不碰钱、不存密码、不编数据。')
add_table(doc, '表 3　边界约定',
          ['维度', '约定', '落地方式'],
          [['分发', '不上架应用商店，最多 GitHub Release 或私发 APK', '仓库 tag 触发 Actions 出包，人工下载后转发'],
           ['网络', '不要求 VPN，校内地址直连', '教务、座位、电费均使用校内或公网直连地址'],
           ['兼容', '最低 Android 5（minSdk 21）', 'bridge 用 Babel 降到 chrome49，禁用新语法与 API'],
           ['支付', '只读不代收', '电费页只展示余额与记录，购电跳一卡通官方落点'],
           ['凭据', '不落盘密码', '只存学号与姓名，密码仅用于当次登录'],
           ['数据', '不编造', '无数据源的项目显示「未同步」，不预置假记录']],
          aligns=['center', 'left', 'left'], widths=[2.6, 6.2, 7.2])

h(doc, '2.2 三层结构与职责', 2)
body(doc, '整个工程只有一份界面代码，即单文件原型。桌面壳与安卓壳都只是容器，不复制界面逻辑；构建脚本把原型与桥文件搬进安卓 assets。这意味着改界面永远只改一个文件，不会出现两端不一致。')
add_table(doc, '表 4　三层结构',
          ['层', '位置', '职责', '是否含业务逻辑'],
          [['原型', '手机端原型.html', '五个页签的全部界面、状态、解析、渲染', '是，唯一来源'],
           ['桌面壳', 'hpu-shell/', '加载原型、提供 hpu 桥、抓课表与成绩、调试探针', '少量，仅抓取与窗口控制'],
           ['安卓壳', 'android/', 'WebView 容器、内嵌网页、UA 切换、原生桥', '少量，仅容器能力']],
          aligns=['center', 'left', 'left', 'center'], widths=[2.2, 4.6, 6.4, 2.8])

h(doc, '2.3 目录职责', 2)
add_table(doc, '表 5　主要目录与文件',
          ['路径', '说明'],
          [['手机端原型.html', '唯一的界面与业务代码，约 19 万字节'],
           ['libs/', '已删除，原 PDF 解析库随 PDF 入口下线一并移除'],
           ['hpu-shell/main.js', 'Electron 主进程，含抓课表、抓成绩、各类探针'],
           ['android/app/src/main/assets/', '构建产物目录，由脚本生成，仓库内保留以便直接编译'],
           ['android/bridge/', 'hpu-native.js、grade-scraper.js、free-prefill.js 三个桥文件'],
           ['android/app/src/main/java/cn/hpu/suishouce/', 'MainActivity、WebPageActivity、HpuBridge、Http'],
           ['.github/workflows/android.yml', '打 tag 自动出包的工作流'],
           ['tools/', '版本号、资源打包、语法检查、解析与截图测试脚本'],
           ['dist/', '本地出包目录，已被 gitignore 忽略'],
           ['预览图/', '界面截图，用于自查与交付预览']],
          aligns=['center', 'left'], widths=[6.4, 9.6])

h(doc, '2.4 开发环境', 2)
body(doc, '本机具备的能力与不具备的能力必须分清，否则会误以为能本地编译。')
add_table(doc, '表 6　环境清单',
          ['能力', '状态', '说明'],
          [['Node.js', '具备（v22 系列）', '跑构建脚本、解析测试、语法检查'],
           ['Git', '具备', '凭据已缓存，可直接 push 与查询 GitHub API'],
           ['Electron', '具备（hpu-shell 内）', '可无界面跑端到端解析与截图'],
           ['JDK / Android SDK', '不具备', '本地无法编译 APK，只能交给 Actions'],
           ['Python 3', '具备', '生成文档、临时数据处理'],
           ['浏览器', '具备（Chrome）', '可直接打开原型预览']],
          aligns=['center', 'center', 'left'], widths=[4.0, 4.0, 8.0])

h(doc, '3 架构与运行机制', 1)
h(doc, '3.1 原型页面结构', 2)
body(doc, '原型是单个 HTML 文件，内部依次是样式、五个 section、通用弹层与全部脚本。底部五个页签对应五个 section：今天（s-home）、课表（s-timetable）、宿舍（s-power）、图书馆（s-library）、校园（s-campus）。页签切换只做 class 切换，不重新加载页面。')
body(doc, '弹层统一走 openSheet 与 closeSheet：内容写进 #sheetBody，遮罩 #mask 加 on 类。首次启动若本机无缓存，会让用户先填资料，再弹导入课表面板，导入完成后才进入正常流程。这套顺序在 1.1.0 之后固定下来，改动前要留意 profileRequired 这个开关，它会让遮罩点击失效，避免用户跳过必填项。')

h(doc, '3.2 状态对象与缓存', 2)
body(doc, '全部运行状态收在一个名为 S 的对象里，持久化通过 persist 写入 localStorage 的 campus_cache_v1 键。persist 不是整体序列化，而是白名单式地挑字段写入，避免把临时对象或函数混进缓存。')
add_table(doc, '表 7　缓存字段',
          ['字段', '内容', '备注'],
          [['courses', '课表对象', '按星期分组的课程数组'],
           ['profile', '学号与姓名', '密码不写入'],
           ['countdown', '学业倒计时条目', '形如 {n, d}'],
           ['todos', '记事本条目', '含完成状态'],
           ['gradeReal', '同步到的成绩', '带同步时间戳'],
           ['elecPick / elecBalances', '电费楼栋与余额记录', '仅本机'],
           ['season / seasonAuto', '作息与自动切换开关', '影响节次时间'],
           ['ver / verBuild', '写入缓存时的版本', '便于排查旧缓存']],
          aligns=['center', 'left', 'left'], widths=[5.0, 5.8, 5.2])
body(doc, 'loadCache 带一次 schema 迁移：当缓存里的 schema 不等于 2 时，只清空课表并标记为示例状态，其余本机记录保留。这样处理是因为早期版本预置过示例课表，直接沿用会和真实课表叠在一起。迁移逻辑集中在 dedupeCourses 里再合并一次，去重键见 5.3。')

h(doc, '3.3 安卓壳的工作方式', 2)
body(doc, 'MainActivity 创建 WebView，加载 assets 里的 index.html；页面脚本执行前，构建脚本已经把 hpu-native.js 插在最前面，因此 window.hpu 一定先于页面代码存在。需要打开校外或校内网页时，走 WebPageActivity 单独承载，避免把主界面顶掉。')
body(doc, 'HpuBridge 暴露的能力包括：读取设备与网络状态、打开内嵌网页、执行登录抓取、发起原生 HTTP 请求。Http.kt 只用 HttpURLConnection，不引第三方库，这是为了保持零依赖、减小包体，代价是复杂请求要自己处理 Cookie 与重定向。')
add_table(doc, '表 8　桥能力对照',
          ['能力', '入口', '调用方'],
          [['打开内嵌网页', 'hpu.openPage(url)', '原型内的链接与入口按钮'],
           ['教务登录抓表', 'hpu.loginAndFetch()', '导入面板的「打开教务并登录」'],
           ['成绩抓取', 'hpu.fetchGrades()', '成绩页同步按钮'],
           ['原生 HTTP', 'hpu.http(url)', '需要绕开 WebView 跨域时使用'],
           ['设备信息', 'hpu.info()', 'UA 策略与页面适配']],
          aligns=['center', 'left', 'left'], widths=[4.0, 6.0, 6.0])

h(doc, '3.4 教务取表的关键路径', 2)
body(doc, '教务系统不允许第三方页面以 iframe 方式嵌入，响应头带同源限制，所以网页原型里点教务只会得到空白。可行路径只有原生 WebView：在容器内完成统一身份认证，落地到教务首页，再从首页 DOM 里取学期标识与课表链接，拼出带参数的课表地址后再进入。')
body(doc, '直接访问裸的课表地址会触发 Hibernate 报错，提示 id to load is required for loading，原因是缺少 semesterId 参数。1.0.8 的修复就是补上这一步：先从首页抠出 semesterId，再拼接地址。这个问题在 1 生成版本的报错截图中出现过，属于最容易复发的故障，排错时优先怀疑它。')
add_table(doc, '表 9　取表链路',
          ['步骤', '动作', '失败表现'],
          [['1', '打开统一认证页并完成登录', '停在登录页或提示验证码'],
           ['2', '落回教务首页 homeExt.action', '空白页，需检查 onReceivedError 提示'],
           ['3', '从首页 DOM 取 semesterId 与课表链接', '取不到参数，后续必报 id to load'],
           ['4', '拼接带 semesterId 的课表地址并进入', '进入后无表格，多为学期参数错误'],
           ['5', '注入脚本读表格 DOM 并回传', '解析 0 条，检查表头与节次列']],
          aligns=['center', 'left', 'left'], widths=[2.0, 8.0, 6.0])

h(doc, '3.5 版本一致性校验', 2)
body(doc, '应用启动时会向 GitHub 读取仓库的最新 tag，与本机内置版本严格比较，不一致就整屏锁定，只显示当前版本与远端版本，提示更新后再用。实现位置是原型的 checkAppVersion 与 lockVersion，数据源仓库常量是 GH_REPO。')
body(doc, '读取顺序是先查 /tags 取第一条，取不到再查 /releases/latest。之所以以 tag 为准，是因为出包由 tag 触发，tag 与安装包天然对应。校验策略选的是「失败放行」：断网、接口超时、仓库不可访问时直接跳过，不阻断使用，避免把自己锁在离线状态里。')
add_table(doc, '表 10　版本校验的行为',
          ['场景', '行为', '说明'],
          [['远端 tag 与本机一致', '正常进入', '常规情况'],
           ['远端 tag 与本机不一致', '整屏锁定', '旧版或超前版本都锁，规则为严格相等'],
           ['请求失败或仓库不可读', '放行进入', '离线可用优先'],
           ['本机版本高于最新 tag', '同样锁定', '发布前先在本地验证时会出现，属于预期']],
          aligns=['center', 'left', 'left'], widths=[6.0, 3.4, 6.6])

h(doc, '4 构建与发版', 1)
h(doc, '4.1 版本号的三处同步', 2)
body(doc, '版本号分布在三个地方：android/gradle.properties 的 versionName 与 versionCode、原型顶部的 APP_VERSION 与 APP_BUILD。手工改容易漏，统一用 tools/bump-version.js 处理，它会同时改文件并自动把 versionCode 加一。')
body(doc, 'APP_BUILD 记录构建日期，只用于展示与排查，不参与校验。versionCode 必须单调递增，否则覆盖安装会被系统拒绝。')

h(doc, '4.2 资源打包脚本', 2)
body(doc, 'tools/build-android-assets.js 负责把原型变成安卓能吃的 assets。它先按 chrome49 目标用 Babel 转译桥文件与页面脚本，再在页面最前面插入 hpu-native.js 的引用，最后写出 android/app/src/main/assets/index.html。没有 Babel 时会退回 esbuild，再不行就原样拷贝，并在日志里提示兼容性风险。')
add_table(doc, '表 11　打包脚本做了什么',
          ['顺序', '动作', '产物'],
          [['1', '转译 android/bridge 三个文件', 'assets 下的同名文件'],
           ['2', '在原型最前插入桥引用', '保证 window.hpu 先存在'],
           ['3', '按 script 块逐个转译页面脚本', 'index.html'],
           ['4', '写出 assets/index.html', '约 198 KB'],
           ['5', '打印所用转译器与体积', '便于确认是否真的降级']],
          aligns=['center', 'left', 'left'], widths=[2.0, 7.6, 6.4])
body(doc, '早期版本还会把 libs 下的 PDF 解析库一并拷进 assets。1.1.0 起 PDF 导入入口下架，这段逻辑与 libs 目录同时删除，现在打包不再处理第三方库，包体因此减少约 1.5 MB。')

h(doc, '4.3 自动构建工作流', 2)
body(doc, '工作流文件是 .github/workflows/android.yml，触发条件有两个：推送以 v 开头的 tag，或手动触发。运行环境是 ubuntu-latest，用 Temurin 17 与 Gradle 8.7，先装 Babel 再跑打包脚本，最后执行 assembleRelease 与 assembleDebug，分别上传两个产物。')
add_table(doc, '表 12　工作流产出',
          ['产物名', '内容', '用途'],
          [['hpu-release-apk', 'release 变体 APK', '日常安装'],
           ['hpu-debug-apk', 'debug 变体 APK', '排查签名或安装异常'],
           ['构建日志', '每步输出', '失败时定位是哪一步']],
          aligns=['center', 'left', 'left'], widths=[5.0, 5.0, 6.0])

h(doc, '4.4 发版步骤', 2)
body(doc, '按下面的顺序执行，任何一步失败都停在该步，不要跳步补做。')
add_table(doc, '表 13　一次完整发版',
          ['序号', '步骤', '命令或动作', '确认点'],
          [['1', '改代码并本地自查', 'node tools/check-syntax.js；必要时跑解析测试', '脚本块 0 报错'],
           ['2', '升版本', 'node tools/bump-version.js 1.1.3', '打印新版本号与 versionCode'],
           ['3', '重打包资源', 'node tools/build-android-assets.js', 'index.html 体积与转译器正常'],
           ['4', '提交', 'git add -A 后 commit', '提交信息写清改了什么'],
           ['5', '推主干', 'git push origin master', '远端分支前进'],
           ['6', '打 tag 并推送', 'git tag -a v1.1.3 -m 说明；git push origin v1.1.3', '触发工作流'],
           ['7', '等待构建', '查 actions/runs 的最新一条', 'status 为 completed 且 conclusion 为 success'],
           ['8', '取包并核验', '下载 hpu-release-apk 解压，确认 APK 体积', '与上次差异合理'],
           ['9', '落到交付位置', '复制到 dist 与桌面并命名', '文件名带版本号，便于回溯']],
          aligns=['center', 'left', 'left', 'left'], widths=[1.6, 5.4, 6.0, 3.8])

h(doc, '4.5 签名与安装', 2)
body(doc, '如果 android 目录下存在 hpu-release.jks，release 用正式签名；不存在时回退到 debug 签名。两种签名的包不能互相覆盖安装，切换时必须先卸载，卸载会清空本机缓存。日常自用一直是回退签名，保持前后一致即可。')
body(doc, '覆盖安装前要确认版本号已升，否则系统会以同版本为由拒绝。安装后联网首次启动会做一次版本校验，这是判断包是否真的对应最新 tag 最快的方法。')

h(doc, '4.6 回退', 2)
body(doc, '回退只需要回到旧提交重新打 tag：把当前 tag 删除，取目标提交再打同名 tag 推送，工作流会重新出包。已下载的 APK 一直保留在 dist 与桌面，必要时可直接装回旧包，但要记得旧包会被版本校验锁住，因为远端 tag 已经前进。')

h(doc, '5 功能实现说明', 1)
h(doc, '5.1 课表导入入口', 2)
body(doc, '导入面板在 1.1.0 做过一次收口，现在只有三个入口，顺序固定：导入 Word 在最前，其次导入 JSON，最后是打开教务并登录。面板内自带五步教程，说明从教务取 Word 的完整路径。早期存在的 PDF、网页文件、粘贴框、油猴脚本下载四个入口与对应解析代码已全部删除，相关函数不再保留为隐藏兜底，避免死代码长期堆积。')
add_table(doc, '表 14　导入入口',
          ['入口', '输入', '解析方式', '适用场景'],
          [['导入课表 Word', '.docx', '自解 zip 读表格', '主流方式，教务导出后转存'],
           ['导入课表 JSON', '.json', '按契约字段读取', '脚本导出或手工整理'],
           ['开通教务登录', '登录态', '原生 WebView 注入读取', '一步到位，需要能联网']],
          aligns=['center', 'left', 'left', 'left'], widths=[3.6, 3.0, 5.0, 4.4])

h(doc, '5.2 Word 解析链', 2)
body(doc, 'docx 本质是一个 zip 包，正文在 word/document.xml。解析分四步：先扫中央目录找到条目，再按本地头读出压缩流，然后按合并标记还原表格网格，最后把每个单元格交给统一的课程语法解析。')
add_table(doc, '表 15　解析链上的函数',
          ['函数', '职责', '要点'],
          [['zipIndex', '扫 EOCD 建目录索引', '从文件尾反向找中央目录结束标记'],
           ['zipRead', '按索引取压缩流', 'method 0 直读，method 8 走 DecompressionStream'],
           ['docxRows', '把表格还原成网格', '按 gridSpan 跨列、vMerge 续行标记 first'],
           ['tidyCell', '收紧多余空格', '中文之间、中文与数字之间的空白反复收三轮'],
           ['docxCourses', '认表头与节次', '表头取星期列，左列取第X节或时间，vMerge 决定连堂'],
           ['cellCourses', '单元格转课程条目', '唯一出口，所有来源最终都走这里']],
          aligns=['center', 'left', 'left'], widths=[3.6, 5.4, 7.0])
body(doc, '实测结果可作回归基准：仓库外那份教务导出的 docx 解析出 25 条课程记录，周几、节次、周次、教室均正确，其中同一格存在多门替代课、以及形如「3-6 8 10-12 14-15」的离散周次写法都能正确拆开。')

h(doc, '5.3 单元格语法与去重', 2)
body(doc, '单元格文本的约定格式是：课程名（课程代码）（教师）（周次，教室），括号成对出现，中间用换行分隔。解析时按括号从右往左切，最后一段按逗号分成周次与教室，周次字符串交给 parseWrs 处理。')
add_table(doc, '表 16　周次写法支持',
          ['写法', '含义', '备注'],
          [['1-16', '第 1 到 16 周', '常规区间'],
           ['1 2 3 5 6', '离散值，空白分隔', '按周次逐个列出'],
           ['单 / 双', '单周或双周', '与区间组合时取交集'],
           ['3-6 8 10-12', '多段并存', '教务同一格多门课时常见']],
          aligns=['center', 'left', 'left'], widths=[4.0, 5.0, 7.0])
body(doc, '去重键的规则是：有课程代码用代码作为键，没有则退化为「名称@星期:起始节」。同一门课二次导入按键更新而不新增，撞课判定只在同一天、节次相交且周次集合相交时才告警，单双周互不干扰。')

h(doc, '5.4 JSON 契约', 2)
body(doc, 'JSON 导入与壳侧回传共用一套字段，仓库内的《课表数据契约v1.md》是权威定义，另有课表标准格式样例.json 可直接对照。改动这里要三处同步：契约文档、样例文件、原型内的解析函数。')
add_table(doc, '表 17　JSON 主要字段',
          ['字段', '类型', '说明'],
          [['n', '字符串', '课程名'],
           ['code', '字符串', '课程代码，缺省时唯一键退化'],
           ['y / r', '字符串', '教师与教室，缺省为待定'],
           ['day', '数字', '1 到 7，对应周一到周日'],
           ['p1 / p2', '数字', '起止节次，连堂时 p2 大于 p1'],
           ['wrs', '数组', '周次区间集合，如 11 到 16'],
           ['wt', '字符串', 'all、odd、even 三种'],
           ['raw', '字符串', '原文片段，供人工核对']],
          aligns=['center', 'center', 'left'], widths=[3.4, 3.0, 9.6])

h(doc, '5.5 课表展示', 2)
body(doc, '课表页有两种视图：周网格与日列表，切换只改渲染不重算数据。网格的列是周一到周日，行是节次，格子里只放课名与教室，点课程块看完整信息，点空白格看该时段全部课程。')
body(doc, '学期起点与总周数是两个常量：SEM_START 定为当年 9 月 3 日，TOTAL_WEEK 为 20 周。首页的学期进度条据此算当前周与剩余周。换学期时必须改这两个值，否则整页周次都会偏移。')
body(doc, '节次时间表 PT 分冬季与夏季两套，默认按日期自动切换，5 月 1 日到 9 月 30 日走夏季作息，其余走冬季。晚课第 10、11 节在界面上用不同颜色标出，方便一眼区分。')

h(doc, '5.6 成绩、电费与座位', 2)
body(doc, '成绩页点同步后由壳侧抓取，自动翻页，结果连同同步时间写进本机。专业排名没有可靠数据源，界面保持「未同步」而不填估算值，这是刻意的取舍。')
body(doc, '宿舍电费接的是学校电费查询站，免登录、三级联动选楼栋楼层房间，只展示余额与记录，不提供任何充值动作。购电按钮跳一卡通官方落点，仍由用户自己完成。')
body(doc, '图书馆座位接的是 libseat 系统，在内嵌网页里登录后选座。桌面壳对座位页单独做竖屏化处理，避免在宽屏窗口里被挤成桌面布局。')

h(doc, '5.7 首页编排与学业倒计时', 2)
body(doc, '首页顺序在 1.1.2 调整为：问候语、我的课表、学期进度、学业倒计时、成绩速览、宿舍电费、记事本、两个快捷入口。课表卡置于最上，是因为它承载当天的即时信息；倒计时紧随学期进度，属于中长期提醒。')
body(doc, '倒计时数据存放在 S.countdown，每条只有名称与日期两个字段。渲染时先把今天零点作为基准，算出每条剩余天数并按日期排序：最近一个尚未到期的条目放大显示天数与名称，其余条目按日期逐行排列，已过期的显示为零天并标注已过。编辑面板支持增删改，保存时过滤掉名称为空或日期格式不合法的条目。')
add_table(doc, '表 18　倒计时渲染规则',
          ['情形', '显示', '说明'],
          [['有未到期条目', '最近一条放大，其余列表', '放大区显示天数、名称、日期'],
           ['全部已过期', '最后一条放大并显示已过', '避免整块空白'],
           ['无任何条目', '提示去编辑添加', '不显示假数据']],
          aligns=['center', 'left', 'left'], widths=[4.6, 5.4, 6.0])

h(doc, '6 已知限制', 1)
body(doc, '下面这些限制是实测确认过的，不是待办事项。遇到相关问题先看这张表，避免重复踩坑。')
add_table(doc, '表 19　限制与规避',
          ['现象', '原因', '规避方式'],
          [['扫描版 PDF 读不出文字', '无文字层', 'PDF 入口已下线，改走 Word'],
           ['Word 解压失败', '老 WebView 无 DecompressionStream', '改用教务登录导入'],
           ['课表页白屏', 'UA 或视口设置不当', '仅在教务站点用桌面 UA，其余跟随默认'],
           ['课表报 id to load', '缺 semesterId', '先从首页取参数再拼地址'],
           ['解析 0 条', '表头或节次列识别失败', '用解析测试脚本对着样例复跑'],
           ['连续请求被限流', '教务对过快点击有频控', '请求间隔不小于 2 秒'],
           ['专业排名长期未同步', '无公开数据源', '保持未同步，不做估算'],
           ['旧版启动即锁屏', '版本严格相等策略', '装最新包后再使用']],
          aligns=['center', 'left', 'left'], widths=[5.6, 6.0, 4.4])

h(doc, '7 二次开发指南', 1)
h(doc, '7.1 改原型的规矩', 2)
body(doc, '原型只有一份，改它就是改整个应用。四条底线要守住：只改手机端原型.html，不在 assets 里手改；改完必须跑语法检查；任何会影响用户可见行为的改动都要升版本并重新出包；不要为了省事引入外部 CDN 依赖，App 在 file 协议下加载外部脚本很容易失败。')
body(doc, '样式集中在文件头部的 style 块，颜色走 CSS 变量与 data-theme 主题，新增元素优先复用已有类名，避免出现第二套视觉语言。')

h(doc, '7.2 新增一张首页卡片', 2)
add_table(doc, '表 20　新增卡片的动作清单',
          ['序号', '动作', '注意点'],
          [['1', '在首页 section 里插入卡片容器', '位置决定曝光顺序，越靠上越常用'],
           ['2', '给出唯一 id，内部留数据挂载点', '渲染函数只改挂载点内容'],
           ['3', '写渲染函数并挂到 renderHome', '保证每次进入首页都能刷新'],
           ['4', '需要持久化就加进 S 与 persist 白名单', '漏加会导致重启后丢失'],
           ['5', '补样式，优先复用现有类与变量', '避免新增配色'],
           ['6', '跑语法检查并截图确认', '截图用桌面壳的截图脚本']],
          aligns=['center', 'left', 'left'], widths=[1.8, 7.4, 6.8])

h(doc, '7.3 接入新的课表来源', 2)
body(doc, '新的解析器只需产出符合契约的数组，不必重复实现周次、撞课、去重这些逻辑，因为它们都在 cellCourses 与后续流程里统一处理。接入点是导入面板新增一个入口，取到文件或文本后调解析函数，再把结果交给预览与写入。')
add_table(doc, '表 21　接入契约',
          ['环节', '输入', '输出', '责任方'],
          [['取文件', '用户选择', 'File 对象', '面板入口'],
           ['解析', 'File 或文本', '课程数组', '新解析器'],
           ['预览', '课程数组', '确认界面', 'previewCourses'],
           ['写入', '确认后的数组', '本机缓存', 'applyCourses'],
           ['去重', '缓存内合并', '更新后的课表', 'dedupeCourses']],
          aligns=['center', 'left', 'left', 'left'], widths=[3.0, 4.4, 4.4, 4.2])

h(doc, '7.4 调试钩子与测试脚本', 2)
body(doc, '原型在启动时把关键能力挂到 window.__campusParse，控制台可以直接调用，不必点界面。这个钩子只用于调试，不参与业务逻辑，可以整体删除而不影响功能。')
add_table(doc, '表 22　调试能力',
          ['能力', '用途', '典型用法'],
          [['docx', '把 File 解析成课程数组', '喂一份教务 Word，看条数与字段'],
           ['cell', '单格文本转课程', '验证某一行特殊写法'],
           ['preview / apply', '预览与写入', '跳过界面验证数据落盘'],
           ['periods', '节次时间表', '核对冬夏作息'],
           ['state', '读取当前状态', '排查缓存是否写对']],
          aligns=['center', 'left', 'left'], widths=[4.0, 6.0, 6.0])
body(doc, '三个测试脚本各有分工：tools/_test-import.js 在 Node 里离线跑解析，只依赖 document.xml，适合快速回归；tools/_electron-test.js 用 Electron 真加载原型，走完整的 File 读取与解压路径，接近真机；tools/_panel-shot.js 负责截图，用于界面自查与交付预览。桌面壳另有 smoke 模式，无界面启动后校验桥、页签与关键按钮是否就位。')

h(doc, '7.5 兼容性约束', 2)
body(doc, '目标是 Android 5 起可用，因此代码要能被 Babel 降到 chrome49 并真正运行。可选链、空值合并、类字段这类语法即使 Babel 能转，也建议少用；新 API 使用前先判断存在性，例如解压能力缺失时给出明确提示而不是抛异常。')
add_table(doc, '表 23　兼容要点',
          ['项目', '约束', '原因'],
          [['脚本语法', '以 chrome49 为下限', '构建脚本按此目标转译'],
           ['解压', 'DecompressionStream 可能缺失', '老 WebView 不支持，需提示改用其他入口'],
           ['网络', '只走直连，不用代理', '定位是不依赖 VPN'],
           ['存储', '只用 localStorage', '无第三方存储依赖'],
           ['包体', '不引第三方前端库', '保持体积与启动速度']],
          aligns=['center', 'left', 'left'], widths=[3.4, 6.4, 6.2])

h(doc, '8 运维与排错', 1)
h(doc, '8.1 常见故障对照', 2)
add_table(doc, '表 24　故障与处理',
          ['故障', '先查', '处理'],
          [['App 打开就锁屏', '远端 tag 与本机版本', '装最新包，或核对 tag 是否已推'],
           ['课表导入后空', '解析脚本对样例的结果', '确认文件是教务导出的个人课表'],
           ['进入教务报 id to load', '取表链路第 3 步', '确认 semesterId 已取到再拼地址'],
           ['页面整体白屏', 'UA 策略与视口注入', '只在教务用桌面 UA'],
           ['构建失败', '工作流日志的最后一步', '多为依赖安装或 Gradle 版本问题'],
           ['覆盖安装被拒', 'versionCode 是否已增', '升版本后重新出包'],
           ['电费页读不到余额', '电费站是否可访问', '校外网络可能不通，属预期']],
          aligns=['center', 'left', 'left'], widths=[5.0, 5.4, 5.6])

h(doc, '8.2 数据与隐私', 2)
body(doc, '所有个人数据只在本机缓存里，卸载即清空。仓库已转为公开，因此代码与提交历史中不得出现真实学号、姓名、手机号、截图等个人信息。此前调试探针里写死过真实学号，已在发布前整条历史清理并重写，当前代码统一使用占位值。')
body(doc, '新增调试代码时，一律使用占位数据；需要真实数据复现时，只在本地临时文件里用，不提交。发布物、文档、截图都按这个标准执行。')

h(doc, '8.3 定期维护建议', 2)
body(doc, '每学期开学要核对两件事：SEM_START 与 TOTAL_WEEK 是否与校历一致；教务导出的课表格式是否变化，若变化先用样例复跑解析脚本，再决定改解析还是改文档。')
body(doc, '每次大版本发布后回看一次工作流的依赖版本，JDK 与 Gradle 的大版本升级通常在一年内有弃用警告，提前处理比临时救火省事。')

h(doc, '附录 A 关键常量', 1)
add_table(doc, '表 A.1　常量与地址速查',
          ['名称', '值或位置', '说明'],
          [['APP_VERSION', '原型顶部常量', '与 tag 严格比较'],
           ['GH_REPO', 'shuaz1/HPU_USERS', '版本校验数据源'],
           ['CACHE_KEY', 'campus_cache_v1', '本机缓存键'],
           ['SEM_START', '2026-09-03', '学期第一周起点'],
           ['TOTAL_WEEK', '20', '学期总周数'],
           ['教务首页', 'zhjw.hpu.edu.cn/eams/homeExt.action', '取 semesterId 的页面'],
           ['统一认证', 'uia.hpu.edu.cn/cas/login', '登录入口'],
           ['课表地址', 'courseTableForStd!courseTable.action', '需带 semesterId'],
           ['成绩地址', 'teach/grade/course/std-grade-modify-apply.action', '同步入口'],
           ['电费站', '183.169.255.4:8080', '明文 http，只读'],
           ['座位系统', 'seatlib.hpu.edu.cn', '内嵌竖屏']],
          aligns=['center', 'left', 'left'], widths=[3.4, 7.4, 5.2])

h(doc, '附录 B 命令速查', 1)
add_table(doc, '表 B.1　常用命令',
          ['用途', '命令'],
          [['升版本', 'node tools/bump-version.js 1.1.3'],
           ['重打包资源', 'node tools/build-android-assets.js'],
           ['语法检查', 'node tools/check-syntax.js'],
           ['离线解析测试', 'node tools/_test-import.js docx 路径\\document.xml'],
           ['端到端测试', 'electron tools/_electron-test.js docx 路径\\文件.docx'],
           ['界面截图', 'electron tools/_panel-shot.js'],
           ['桌面壳自检', 'electron hpu-shell --smoke'],
           ['查构建状态', 'GitHub API：actions/runs 最新一条'],
           ['取产物', '下载 hpu-release-apk 并解压']],
          aligns=['center', 'left'], widths=[4.4, 11.6])

h(doc, '附录 C 变更记录', 1)
add_table(doc, '表 C.1　版本演进',
          ['版本', '主要内容'],
          [['1.0.0 至 1.0.2', '工程脚手架、图标、Babel 降级修正'],
           ['1.0.3 至 1.0.5', '启动图标迭代'],
           ['1.0.6', '登录后跳课表并等渲染再抓'],
           ['1.0.7', '内嵌网页电脑标识与 1280 宽排版'],
           ['1.0.8', '先从首页取 semesterId 再拼地址，修复 id to load'],
           ['1.0.9', '电脑标识只对教务生效，修手机版白屏'],
           ['1.1.0', '导入收口为 Word、JSON、教务登录；加取表教程；版本一致性校验；署名简化；空闲教室下线'],
           ['1.1.1', '学业倒计时挂到首页，最近一条放大'],
           ['1.1.2', '首页顺序调整，我的课表置顶']],
          aligns=['center', 'left'], widths=[3.6, 12.4])

doc.save(OUT)
print('saved', OUT)
