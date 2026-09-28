"""原创六升七题库 v1：答案和解析仅在服务端保存，交卷后才能公开。

每个维度取三道小学基础题和一道衔接题；低基础学生使用入口题，其他学生
使用综合题。教材版本只用于建档，不虚构与未导入教材的逐章映射。
"""
import hashlib
import random
from app.services.transition_diagrams import diagram_for, corrected_question_display

VERSION = "math-transition-2026.3"
DIMENSIONS = ["数与运算", "分数与百分数", "比与比例", "图形与测量", "数据与统计", "代数初步"]
ADVICE = [
    "先说清运算顺序，再分步计算；每天练习四则混合运算并验算。",
    "用线段或百格图表示整体与部分，区分百分率和实际数量。",
    "先找相对应的量和单位，再写比或比例式，并核对实际意义。",
    "画草图标注已知量，区分长度、面积、体积及其单位。",
    "先读清图表的标题、单位和样本量，再计算平均数或所占比例。",
    "用字母表示未知量，从等量关系列式，并将结果代回原式检验。",
]


def item(d, n, text, options, answer, explanation, stage="basic", difficulty="基础"):
    return {"id": f"t1-{d}-{n}", "dimension": d, "text": text,
            "options": dict(zip("ABCD", options)), "answer": answer, "explanation": explanation,
            "stage": stage, "difficulty": difficulty, "weight": 1}


BANK = [
    item(0, 0, "计算 48 ÷ 6 + 7 × 3。", ["45", "29", "35", "31"], "B", "先乘除后加减：8 + 21 = 29。"),
    item(0, 1, "计算 2.5 × 0.4。", ["0.1", "10", "1", "0.01"], "C", "25 × 4 = 100，积保留两位小数，得到 1。"),
    item(0, 2, "甲每 12 分钟、乙每 18 分钟到站一次。两车同时到站后，至少再过几分钟同时到站？", ["6", "24", "30", "36"], "D", "12 和 18 的最小公倍数是 36。"),
    item(0, 3, "用简便方法计算 99 × 37 + 37。", ["3700", "3663", "3737", "3637"], "A", "提取相同因数：37 × (99 + 1) = 3700。", difficulty="综合"),
    item(0, 4, "气温从 -3℃ 上升 8℃，现在是多少摄氏度？", ["-11", "11", "5", "-5"], "C", "在数轴上从 -3 向右移动 8 个单位，得到 5。", "transition", "衔接"),
    item(1, 0, "1/2 + 1/3 等于多少？", ["2/5", "5/6", "1/6", "2/6"], "B", "通分：3/6 + 2/6 = 5/6。"),
    item(1, 1, "一本书有 80 页，读了 25%，读了多少页？", ["20", "25", "60", "32"], "A", "把总页数看作整体：80 × 25% = 20 页。"),
    item(1, 2, "3/4 ÷ 1/2 等于多少？", ["3/8", "2/3", "3/2", "1/4"], "C", "除以一个非零分数，等于乘它的倒数：3/4 × 2 = 3/2。"),
    item(1, 3, "一件衣服原价 200 元，先降价 20%，再按降价后的价格涨价 20%，现价多少元？", ["200", "192", "180", "208"], "B", "两次变化的整体不同：200 × 0.8 × 1.2 = 192 元。", difficulty="综合"),
    item(1, 4, "将 0.35 化为最简分数。", ["35/10", "7/20", "3/5", "7/10"], "B", "0.35 = 35/100 = 7/20，小数与分数都是有理数的表示。", "transition", "衔接"),
    item(2, 0, "把比 12 : 18 化为最简整数比。", ["3:2", "6:9", "2:3", "4:9"], "C", "前后项都除以最大公因数 6，得到 2:3。"),
    item(2, 1, "男生与女生人数比为 3:2，全班 40 人，男生有多少人？", ["16", "20", "24", "30"], "C", "总共 5 份，男生占 3 份：40 ÷ 5 × 3 = 24。"),
    item(2, 2, "地图比例尺为 1:100000，图上 3 厘米表示实际多少千米？", ["0.3", "3", "30", "300"], "B", "实际距离 300000 厘米，换算成千米是 3 千米。"),
    item(2, 3, "配制糖水，糖与水的质量比是 1:4。200 克糖水中有多少克糖？", ["40", "50", "80", "160"], "A", "糖水是 1 + 4 = 5 份，糖为 200 ÷ 5 = 40 克。", difficulty="综合"),
    item(2, 4, "若 x/6 = 4/3，则 x 等于多少？", ["2", "4.5", "8", "12"], "C", "等式两边同乘 6：x = 6 × 4/3 = 8。", "transition", "衔接"),
    item(3, 0, "一个长方形长 8 厘米、宽 5 厘米，周长是多少厘米？", ["13", "26", "40", "80"], "B", "周长 = (长 + 宽) × 2 = 26 厘米。"),
    item(3, 1, "三角形底为 10 厘米，对应高为 6 厘米，面积是多少平方厘米？", ["60", "16", "30", "32"], "C", "面积 = 底 × 高 ÷ 2 = 30 平方厘米。"),
    item(3, 2, "棱长为 3 厘米的正方体，体积是多少立方厘米？", ["9", "18", "27", "54"], "C", "体积 = 棱长 × 棱长 × 棱长 = 27 立方厘米。"),
    item(3, 3, "圆的半径为 3 厘米，取圆周率 3.14，其面积是多少平方厘米？", ["18.84", "9.42", "28.26", "37.68"], "C", "圆面积 = 圆周率 × 半径平方 = 3.14 × 9 = 28.26。", difficulty="综合"),
    item(3, 4, "一条直线上相邻的两个角组成平角，一个角为 65°，另一个角为多少度？", ["25", "65", "115", "125"], "C", "平角为 180°，另一个角为 180° - 65° = 115°。", "transition", "衔接"),
    item(4, 0, "三次数学练习的得分是 70、80、90，平均分是多少？", ["70", "75", "80", "90"], "C", "平均数 = 总分 ÷ 次数 = 240 ÷ 3 = 80。"),
    item(4, 1, "调查 40 名同学，其中 10 人喜欢篮球，在扇形统计图中篮球部分占多少？", ["10%", "25%", "40%", "75%"], "B", "10 ÷ 40 = 25%。扇形图表达部分与整体的关系。"),
    item(4, 2, "要比较四个班各自的图书数量，最适合使用哪一种统计图？", ["条形统计图", "折线统计图", "路线图", "位置图"], "A", "条形统计图适合比较不同类别数量的大小。"),
    item(4, 3, "五个数为 2、3、3、4、18，下列说法正确的是？", ["平均数为 3", "平均数为 6", "每个数都等于 6", "没有数小于平均数"], "B", "总和 30，平均数是 6；平均数不代表每个个体的数值。", difficulty="综合"),
    item(4, 4, "袋中有 3 个红球、2 个蓝球，球除颜色外完全相同。随机摸一个，摸到红球的可能性是？", ["2/5", "1/2", "3/5", "3/2"], "C", "总共 5 个球，其中 3 个红球，可能性是 3/5。", "transition", "衔接"),
    item(5, 0, "若 x + 7 = 19，则 x 等于多少？", ["12", "26", "7", "19"], "A", "等式两边都减去 7，得到 x = 12。"),
    item(5, 1, "每本练习本 a 元，买 5 本需要多少元？", ["a+5", "a/5", "5a", "5-a"], "C", "总价 = 单价 × 数量，即 5a。"),
    item(5, 2, "找规律：3、6、9、12，后面一个数应是多少？", ["13", "14", "15", "18"], "C", "相邻两项相差 3，所以后一项为 12 + 3 = 15。"),
    item(5, 3, "小明买 3 本同价笔记本，又买 2 元的笔，共花 17 元。每本笔记本多少元？", ["3", "5", "6", "15"], "B", "设每本 x 元，3x + 2 = 17，解得 x = 5。", difficulty="综合"),
    item(5, 4, "化简 3a + 2a。", ["5a", "5a²", "6a", "a"], "A", "同类项的系数相加，字母及指数不变：3a + 2a = 5a。", "transition", "衔接"),
]


def build_paper(profile, seed):
    total, score = profile.get("exam_total"), profile.get("exam_score")
    advanced = bool(total and score is not None and score / total >= .8)
    rng = random.Random(hashlib.sha256(str(seed).encode()).hexdigest())
    paper = []
    for dimension in range(6):
        rows = [dict(q) for q in BANK if q["dimension"] == dimension]
        weak_words = [("计算", "运算"), ("分数", "百分"), ("比例", "比与"), ("几何", "图形"), ("统计", "数据"), ("代数", "方程", "应用题")][dimension]
        needs_entry = any(word in profile.get("weak_topics", "") for word in weak_words)
        # 共同锚题保留两道，用一题区分入口/综合难度，另有一题衔接探查。
        selected = [rows[1], rows[2], rows[3 if advanced and not needs_entry else 0], rows[4]]
        rng.shuffle(selected)
        for q in selected:
            diagram = diagram_for(q["id"])
            if diagram:
                q["diagram"] = diagram
            correct_text = q["options"][q["answer"]]
            options = list(q["options"].values())
            rng.shuffle(options)
            q["options"] = dict(zip("ABCD", options))
            q["answer"] = next(key for key, value in q["options"].items() if value == correct_text)
        paper.extend(selected)
    return paper


def public_paper(paper):
    return [{k: v for k, v in corrected_question_display(q).items()
             if k not in ("answer", "explanation")} for q in paper]


def grade_paper(paper, answers):
    evidence = []
    for q in paper:
        chosen = answers.get(q["id"])
        state = "skipped" if not chosen else "correct" if chosen == q["answer"] else "wrong"
        evidence.append({**q, "chosen": chosen, "state": state})
    distribution = {key: sum(q["state"] == key for q in evidence) for key in ("correct", "wrong", "skipped")}
    dimensions = []
    for d, name in enumerate(DIMENSIONS):
        rows = [q for q in evidence if q["dimension"] == d]
        correct = sum(q["state"] == "correct" for q in rows)
        dimensions.append({"name": name, "score": round(correct / len(rows) * 100, 1) if rows else None,
                           "correct": correct, "sample_size": len(rows),
                           "skipped": sum(q["state"] == "skipped" for q in rows), "advice": ADVICE[d]})
    weak = sorted(dimensions, key=lambda row: row["score"] if row["score"] is not None else -1)[:2]
    return {"score": round(distribution["correct"] / len(paper) * 100, 1),
            "distribution": distribution, "dimensions": dimensions, "evidence": evidence,
            "priority": [r["name"] for r in weak], "version": VERSION,
            "interpretation": None, "interpretation_mode": "rules",
            "notice": "本报告基于本次 24 题，每个维度仅 4 题；未作答计入未作答，不直接等同于不会。它是学习建议，不是能力定级或心理诊断。"}
