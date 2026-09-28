"""题图由有限几何元素组成，网页和 PDF 使用同一坐标与标注。"""
import math


def line(x1, y1, x2, y2, dashed=False):
    return {"kind": "line", "x1": x1, "y1": y1, "x2": x2, "y2": y2, "dashed": dashed}


def label(x, y, value):
    return {"kind": "text", "x": x, "y": y, "text": str(value)}


def polygon(points, fill="none"):
    return {"kind": "polygon", "points": points, "fill": fill}


def legacy_statistics_grid():
    """只用于识别已发布的错误题图，不覆盖其他版本或上传的题目。"""
    return {"width": 440, "height": 260,
            "alt": "调查 40 人，篮球 10 人，其他 30 人。方格中每格代表 1 人，蓝色为篮球，白色为其他。",
            "elements": [polygon([[55+c*32,55+r*32],[83+c*32,55+r*32],
                                  [83+c*32,83+r*32],[55+c*32,83+r*32]],
                                 "#c4daf5" if r == 0 else "#ffffff")
                         for r in range(4) for c in range(10)]
                        + [label(220,214,"每格 1 人 · 蓝色：篮球 · 白色：其他")]}


def corrected_question_display(question):
    """旧快照只在读取时更正题图，题干、选项、答案与数据库记录保持不变。"""
    if (question.get("id") == "t1-4-1"
            and question.get("text") == "调查 40 名同学，其中 10 人喜欢篮球，在扇形统计图中篮球部分占多少？"
            and question.get("diagram") == legacy_statistics_grid()):
        diagram = diagram_for("t1-4-1")
        diagram["caption"] = "原方格配图已更正为扇形统计图，题干、选项和作答记录未变。"
        return {**question, "diagram": diagram}
    return question


def diagram_for(question_id):
    figures = {
        "t1-3-0": ("长方形，长 8 厘米，宽 5 厘米。", [polygon([[95,50],[335,50],[335,200],[95,200]]), label(215,228,"8 厘米"), label(50,125,"5 厘米")]),
        "t1-3-1": ("三角形，底 10 厘米，对应高 6 厘米，虚线表示高。", [polygon([[75,195],[350,195],[170,40]]), line(170,40,170,195,True), polygon([[170,181],[184,181],[184,195]]), label(210,226,"底 10 厘米"), label(216,125,"高 6 厘米")]),
        "t1-3-2": ("正方体透视示意图，棱长 3 厘米，虚线表示隐藏棱。", [polygon([[135,95],[265,95],[265,215],[135,215]],"#eef4fa"), polygon([[135,95],[195,40],[325,40],[265,95]],"#e0edff"), polygon([[265,95],[325,40],[325,160],[265,215]],"#c4daf5"), line(135,215,195,160,True), line(195,160,325,160,True), line(195,160,195,40,True), label(195,240,"3 厘米")]),
        "t1-3-3": ("圆心 O，半径 3 厘米。", [{"kind":"circle","cx":210,"cy":130,"r":85}, line(210,130,295,130), label(200,153,"O"), label(250,113,"3 厘米")]),
        "t1-3-4": ("A、O、B 在同一直线上，射线 OC 与 OB 夹角为 65 度，求相邻角。", [line(60,190,375,190), line(210,190,273,55), label(53,213,"A"),label(210,214,"O"),label(385,213,"B"),label(278,39,"C"),label(265,170,"65°"),label(153,151,"?"), polygon([[210,190]] + [[210+48*math.cos(t),190-48*math.sin(t)] for t in [i*math.radians(65)/15 for i in range(16)]],"#e0edff")]),
        "t1-0-4": ("数轴从负 4 到 8，起点标在负 3；未标出移动后的终点。", [line(35,130,403,130),polygon([[403,130],[393,125],[393,135]],"#17334c"), {"kind":"circle","cx":68,"cy":130,"r":5}] + [element for n in range(-4,9) for element in (line(40+(n+4)*28,124,40+(n+4)*28,136),label(40+(n+4)*28,157,n))]),
        "t1-4-1": ("兴趣调查扇形统计图：共 40 人，蓝色表示喜欢篮球的 10 人，浅灰色表示其他 30 人。", [
            {"kind": "sector", "cx": 130, "cy": 125, "r": 85, "startAngle": -90, "endAngle": 0, "fill": "#3478e5"},
            {"kind": "sector", "cx": 130, "cy": 125, "r": 85, "startAngle": 0, "endAngle": 270, "fill": "#e5edf5"},
            polygon([[260,81],[274,81],[274,95],[260,95]], "#3478e5"), label(339,94,"篮球 10 人"),
            polygon([[260,126],[274,126],[274,140],[260,140]], "#e5edf5"), label(339,139,"其他 30 人"),
            label(220,246,"兴趣调查 · 共 40 人")]),
    }
    found = figures.get(question_id)
    if not found:
        return None
    diagram = {"width":440,"height":260,"alt":found[0],"elements":found[1]}
    if question_id == "t1-4-1":
        diagram["caption"] = "扇形面积表示人数占比，请根据题目条件计算。"
    return diagram
