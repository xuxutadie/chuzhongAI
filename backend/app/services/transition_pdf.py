"""六页诊断主体与按需题图、访谈附录：中文字体与矢量图形均嵌入 PDF。"""
from io import BytesIO
import math
import os
from pathlib import Path
from threading import Lock
from xml.sax.saxutils import escape

from reportlab.lib.colors import HexColor, Color, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from app.services.transition_pdf_diagrams import draw_diagram
from app.services.transition_diagrams import corrected_question_display
from app.services.transition_interview import QUESTIONS

NAVY = HexColor("#17334C")
BLUE = HexColor("#2860DC")
TEAL = HexColor("#159C93")
MUTED = HexColor("#52697A")
PALE = HexColor("#EEF4FA")
ORANGE = HexColor("#D98838")
FONT_LOCK = Lock()


def register_chinese_font():
    with FONT_LOCK:
        if "DiagnosisCN" in pdfmetrics.getRegisteredFontNames():
            return
        # 不复制或重新分发操作系统字体；部署 Linux 时可放置开放授权的中文 TTF。
        candidates = [Path(__file__).parents[2] / "assets/fonts/NotoSansSC-Regular.ttf",
                      Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts/simhei.ttf",
                      Path("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc")]
        for path in candidates:
            if path.is_file():
                pdfmetrics.registerFont(TTFont("DiagnosisCN", str(path)))
                return
        raise FileNotFoundError("请安装可嵌入的中文 TrueType 字体，详见诊断模块部署说明。")


def register_number_font():
    """嵌入数字字体，换一台电脑阅读时也保持相同字宽。"""
    with FONT_LOCK:
        if "DiagnosisNumbers" in pdfmetrics.getRegisteredFontNames():
            return "DiagnosisNumbers"
        for path in (Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts/arialbd.ttf",
                     Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")):
            if path.is_file():
                pdfmetrics.registerFont(TTFont("DiagnosisNumbers", str(path)))
                return "DiagnosisNumbers"
    return "DiagnosisCN"


def render_report(attempt):
    register_chinese_font()
    number_font = register_number_font()
    output = BytesIO()
    pdf = canvas.Canvas(output, pagesize=A4)
    pdf.setTitle("数学衔接学习诊断报告")
    pdf.setAuthor("AI 初中学习教练")
    width, height = A4
    report, profile = attempt["report"], attempt["profile"]
    report = {**report, "evidence": [corrected_question_display(q) for q in report["evidence"]]}
    figures = [(i + 1, q) for i, q in enumerate(report["evidence"]) if q.get("diagram")]
    details = [(row["title"], profile.get("learning_details", {}).get(row["field"])) for row in QUESTIONS
               if profile.get("learning_details", {}).get(row["field"])]
    # 依照实际文字高度分页，短回答不单独占一整页，长回答也不会挤出页脚。
    detail_pages, current_details, used_height = [], [], 0
    detail_style = ParagraphStyle("detail", fontName="DiagnosisCN", fontSize=10, leading=16, wordWrap="CJK")
    for title, value in details:
        value = " ".join(str(value).split())
        block = Paragraph(escape(value), detail_style)
        _, block_height = block.wrap(width - 84, height)
        required = block_height + 40
        if current_details and used_height + required > 575:
            detail_pages.append(current_details)
            current_details, used_height = [], 0
        current_details.append((title, value))
        used_height += required
    if current_details:
        detail_pages.append(current_details)
    total_pages = 6 + math.ceil(len(figures) / 2) + len(detail_pages)

    def text(value, x, y, size=11, color=NAVY):
        pdf.setFillColor(color)
        pdf.setFont("DiagnosisCN", size)
        pdf.drawString(x, y, str(value))

    def number(value, x, y, size=11, color=NAVY):
        # 数字使用等高、紧凑的西文字形，避免中文字体让小数点看起来脱节。
        pdf.setFillColor(color)
        pdf.setFont(number_font, size)
        pdf.drawString(x, y, str(value))

    def paragraph(value, x, y, w, size=11, color=NAVY):
        style = ParagraphStyle("body", fontName="DiagnosisCN", fontSize=size, leading=size * 1.6,
                               textColor=color, wordWrap="CJK")
        block = Paragraph(escape(str(value)).replace("\n", "<br/>"), style)
        _, h = block.wrap(w, height)
        block.drawOn(pdf, x, y - h)
        return y - h

    def page(number, title, subtitle):
        pdf.setFillColor(white)
        pdf.rect(0, 0, width, height, fill=1, stroke=0)
        pdf.setFillColor(BLUE)
        pdf.rect(0, height - 9, width, 9, fill=1, stroke=0)
        text("MATH / 六升七学习档案", 42, height - 43, 10, BLUE)
        text(title, 42, height - 88, 25)
        paragraph(subtitle, 42, height - 107, width - 84, 10, MUTED)
        pdf.setStrokeColor(HexColor("#D8E3ED"))
        pdf.line(42, 49, width - 42, 49)
        text("个人学习资料 · 请妥善保管", 42, 31, 9, MUTED)
        text(f"{number} / {total_pages}", width - 78, 31, 9, MUTED)

    page(1, "数学衔接学习诊断报告", "先了解自己，再找到下一步。报告只依据本次作答与学生确认的资料。")
    pdf.setFillColor(PALE)
    pdf.setFillColor(NAVY)
    pdf.roundRect(42, 442, width - 84, 242, 16, fill=1, stroke=0)
    paragraph(profile.get("nickname", "同学"), 65, 653, width - 130, 20, white)
    paragraph(f'{profile.get("grade", "")} · {profile.get("textbook", "教材待确认")}', 65, 573, width - 130, 10, HexColor("#CBDCEB"))
    number(f'{report["score"]:g}', 65, 467, 52, white)
    text("本次测评得分", 249, 493, 11, HexColor("#CBDCEB"))
    number("/ 100", 249, 468, 19, white)
    text("测评概况", 42, 410, 17)
    distribution = report["distribution"]
    card_width = (width - 108) / 3
    for i, (key, label, color) in enumerate((("correct", "答对", TEAL), ("wrong", "答错", ORANGE), ("skipped", "未作答", MUTED))):
        x = 42 + i * (card_width + 12)
        pdf.setFillColor(PALE)
        pdf.roundRect(x, 329, card_width, 62, 9, fill=1, stroke=0)
        text(label, x + 14, 370, 10, MUTED)
        number(distribution[key], x + 14, 344, 22, color)
        text("题", x + 54, 346, 10, MUTED)
    prior = "未填写（不会按 0 分处理）" if profile.get("exam_score") is None else f'{profile["exam_score"]:g} / {profile["exam_total"]:g}'
    paragraph(f'学生自报最近考试：{prior}；时间：{profile.get("exam_date") or "未填写"}。自报成绩与本次测评不可直接作等值比较。', 42, 310, width - 84, 10, MUTED)
    paragraph(f'完成日期：{(attempt.get("submitted_at") or "")[:10]}  ·  题库版本：{attempt["version"]}', 42, 222, width - 84, 10, MUTED)
    paragraph(report["notice"], 42, 179, width - 84, 11)
    pdf.showPage()

    page(2, "六个维度，逐项看清", "柱状图：各维度答对题数 ÷ 该维度总题数。纵向维度之间样本量相同。")
    for i, d in enumerate(report["dimensions"]):
        y = 653 - i * 78
        text(d["name"], 42, y, 12)
        value = f'{d["correct"]}/{d["sample_size"]} 题 · {d["score"]:g}%'
        text(value, width - 42 - pdfmetrics.stringWidth(value, "DiagnosisCN", 10), y, 10, MUTED)
        pdf.setFillColor(PALE)
        pdf.roundRect(42, y - 29, width - 84, 15, 6, stroke=0, fill=1)
        pdf.setFillColor(BLUE if d["score"] >= 75 else TEAL)
        if d["score"]:
            pdf.roundRect(42, y - 29, (width - 84) * d["score"] / 100, 15, 6, stroke=0, fill=1)
    paragraph("阅读提示：每个维度只有 4 题，答对一题就改变 25 个百分点。不要把单次的小样本差异当成稳定的能力差距。", 42, 159, width - 84, 11, MUTED)
    pdf.showPage()

    page(3, "看见结构，而不只看总分", "上图看各维度表现，下图看作答分布。全部数值均来自本次真实作答。")
    # 图形、数据、说明分别占用固定区域，不把图例浮放在数据图层上。
    pdf.setFillColor(PALE)
    pdf.roundRect(42, 337, width - 84, 361, 12, fill=1, stroke=0)
    text("01 / 六维表现雷达图", 60, 674, 13, NAVY)
    text("刻度 0-100% · 每个维度 4 题", 60, 653, 9, MUTED)
    cx, cy, radius = width / 2, 492, 100

    def point(index, value):
        angle = math.pi / 2 - index * math.pi / 3
        return cx + radius * value * math.cos(angle), cy + radius * value * math.sin(angle)

    pdf.saveState()
    pdf.setLineWidth(.7)
    for scale in (.25, .5, .75, 1):
        path = pdf.beginPath()
        for i in range(7):
            x, y = point(i % 6, scale)
            path.moveTo(x, y) if i == 0 else path.lineTo(x, y)
        pdf.setStrokeColor(HexColor("#D5E1EB"))
        pdf.drawPath(path)
    for i in range(6):
        pdf.line(cx, cy, *point(i, 1))
    path = pdf.beginPath()
    for i, d in enumerate(report["dimensions"]):
        x, y = point(i, d["score"] / 100)
        path.moveTo(x, y) if i == 0 else path.lineTo(x, y)
    path.close()
    pdf.setStrokeColor(TEAL)
    pdf.setLineWidth(1.8)
    pdf.setFillColor(Color(.08, .65, .6, alpha=.16))
    pdf.drawPath(path, fill=1, stroke=1)
    pdf.restoreState()
    # 先画数据，再画刻度和顶点，避免半透明填色覆盖文字或污染下一张图。
    for scale in (.25, .5, .75, 1):
        text(f"{int(scale*100)}", cx + 6, cy + radius * scale + 3, 8, MUTED)
    for i, d in enumerate(report["dimensions"]):
        x, y = point(i, d["score"] / 100)
        pdf.setFillColor(TEAL)
        pdf.circle(x, y, 2.8, fill=1, stroke=0)
        # 侧面的双行标签向外让位，100% 顶点也不能碰到标签末尾。
        lx, ly = point(i, 1.3 if i in (0, 3) else 1.6)
        name_width = pdfmetrics.stringWidth(d["name"], "DiagnosisCN", 10)
        text(d["name"], lx - name_width / 2, ly, 10)
        value = f'{d["score"]:g}% · {d["correct"]}/{d["sample_size"]} 题'
        value_width = pdfmetrics.stringWidth(value, "DiagnosisCN", 9)
        text(value, lx - value_width / 2, ly - 14, 9, MUTED)

    pdf.setFillColor(PALE)
    pdf.roundRect(42, 106, width - 84, 215, 12, fill=1, stroke=0)
    text("02 / 作答分布", 60, 296, 13)
    total = sum(distribution.values())
    text(f"共 {total} 题", width - 116, 296, 10, MUTED)
    text("结果", 281, 264, 9, MUTED)
    text("题数", 383, 264, 9, MUTED)
    text("占比", 459, 264, 9, MUTED)
    pdf.saveState()
    angle = 90
    for key, label, color in [("correct", "答对", TEAL), ("wrong", "答错", ORANGE), ("skipped", "未作答", HexColor("#ACBAC8"))]:
        count = distribution[key]
        share = count / total if total else 0
        extent = -share * 360
        pdf.setFillColor(color)
        if count and count == total:
            pdf.circle(153, 202, 67, fill=1, stroke=0)
        elif count:
            pdf.wedge(86, 135, 220, 269, angle, extent, fill=1, stroke=0)
        angle += extent
        line = {"correct": 0, "wrong": 1, "skipped": 2}[key]
        row_y = 239 - 43 * line
        pdf.roundRect(262, row_y - 1, 9, 9, 2, fill=1, stroke=0)
        text(label, 281, row_y, 11)
        text(str(count), 390, row_y, 11)
        text(f"{share * 100:.1f}%", 455, row_y, 11)
    pdf.restoreState()
    paragraph("每个维度仅 4 题；未作答不等于不会。图表用于安排复习，不用于排名。", 42, 89, width - 84, 9, MUTED)
    pdf.showPage()

    page(4, "从答题证据走向复习", "优先展示最多 6 道答错题；若不足，补充未作答题。完整题目与解析见网页报告。")
    examples = [q for q in report["evidence"] if q["state"] == "wrong"] + [q for q in report["evidence"] if q["state"] == "skipped"]
    if not examples:
        paragraph("本次全部答对，很好！建议隔一周用变式题和实际问题检验迁移能力。本次选择题不能替代完整书写过程的检查。", 42, 651, width - 84, 14)
    for i, q in enumerate(examples[:6]):
        y = 664 - i * 92
        pdf.setFillColor(PALE)
        pdf.roundRect(42, y - 68, width - 84, 83, 9, fill=1, stroke=0)
        original_number = next(index + 1 for index, row in enumerate(report["evidence"]) if row["id"] == q["id"])
        text(f'第 {original_number} 题  /  {"答错" if q["state"] == "wrong" else "未作答"} · {report["dimensions"][q["dimension"]]["name"]}', 54, y, 10, BLUE)
        end = paragraph(q["text"], 54, y - 10, width - 108, 10)
        paragraph(f'你的选择：{q["chosen"] or "未作答"}；参考：{q["answer"]}。{q["explanation"]}', 54, end - 3, width - 108, 9, MUTED)
    pdf.showPage()

    page(5, "完整作答记录", "记录首次交卷结果。复测会生成独立报告，不会覆盖这次记录。")
    text("题号", 48, 674, 10)
    text("考查维度", 108, 674, 10)
    text("阶段", 265, 674, 10)
    text("选择 / 参考", 355, 674, 10)
    text("结果", 476, 674, 10)
    for i, q in enumerate(report["evidence"]):
        y = 647 - 22 * i
        if i % 2 == 0:
            pdf.setFillColor(PALE)
            pdf.rect(42, y - 6, width - 84, 22, fill=1, stroke=0)
        text(f"{i+1:02d}", 48, y, 10)
        text(report["dimensions"][q["dimension"]]["name"], 108, y, 10)
        text("小学基础" if q["stage"] == "basic" else "初中衔接", 265, y, 10)
        text(f'{q["chosen"] or "-"} / {q["answer"]}', 355, y, 10)
        text({"correct": "答对", "wrong": "答错", "skipped": "未作答"}[q["state"]], 476, y, 10)
    pdf.showPage()

    page(6, "接下来两周，这样开始", "从小目标开始，坚持练习、说理、订正和回顾。以下建议可和老师一起调整。")
    y = paragraph("优先复习：" + "、".join(report["priority"]), 42, 663, width - 84, 17)
    if distribution["skipped"]:
        y = paragraph("有未作答题：先确认是时间不够、未学过还是暂时没思路，再决定是否补测。", 42, y - 13, width - 84, 11, MUTED)
    y -= 23
    for label, body in [
        ("第 1-3 天 · 找到起点", "回看报告中的答错题，画图或用自己的话说明题意；优先处理第一项复习内容。"),
        ("第 4-7 天 · 练习与说理", "围绕第二项复习内容，每天做少量变式题；订正时写出关键步骤，不只抄答案。"),
        ("第 8-10 天 · 从小学走向初中", "练习负数、字母表示数和简单等式。把题目中的文字关系转成图或算式。"),
        ("第 11-14 天 · 回顾与复测", "混合练习六个维度，回顾错题；准备好后再做一次独立复测，题目相近时注意熟悉效应。"),
    ]:
        text(label, 42, y, 13, BLUE)
        y = paragraph(body, 42, y - 13, width - 84, 11) - 24
    minutes = profile.get("daily_minutes")
    y = paragraph(f'每日时间：{str(minutes) + " 分钟（学生自报）" if minutes else "未填写，可先与老师商量一个可坚持的时长"}。', 42, y, width - 84, 11, MUTED) - 18
    text("AI 补充建议" if report.get("interpretation") else "规则诊断说明", 42, y, 13)
    paragraph(report.get("interpretation") or "当前报告使用固定教学规则生成建议，没有伪装为实时 AI 分析。图表与分数始终由服务端按真实答案计算。", 42, y - 13, width - 84, 10, MUTED)
    pdf.showPage()
    page_number = 7
    for start in range(0, len(figures), 2):
        page(page_number, "图形题与解析", "几何示意图以标注为准；统计扇形按占比绘制。已知配图更正会单独说明。")
        for offset, (number, question) in enumerate(figures[start:start + 2]):
            top = 670 - offset * 295
            paragraph(f'第 {number} 题 · {question["text"]}', 42, top, width - 84, 11)
            draw_diagram(pdf, question["diagram"], 42, top - 48)
            options = "\n".join(f"{key}. {value}" for key, value in question["options"].items())
            end = paragraph(options, 326, top - 60, width - 368, 10)
            paragraph(f'你的选择：{question["chosen"] or "未作答"}\n参考答案：{question["answer"]}', 326, end - 12, width - 368, 10, BLUE)
            end = paragraph(question["explanation"], 42, top - 222, width - 84, 10, MUTED)
            if question["diagram"].get("caption"):
                paragraph(question["diagram"]["caption"], 42, end - 7, width - 84, 8, MUTED)
        pdf.showPage()
        page_number += 1
    for entries in detail_pages:
        page(page_number, "你告诉我的学习情况", "以下内容来自学生确认的自述，用于安排学习支持，不等同于能力或心理判断。")
        top = 670
        for title, value in entries:
            text(title, 42, top, 13, BLUE)
            top = paragraph(value, 42, top - 16, width - 84, 10) - 24
        pdf.showPage()
        page_number += 1
    pdf.save()
    return output.getvalue()
