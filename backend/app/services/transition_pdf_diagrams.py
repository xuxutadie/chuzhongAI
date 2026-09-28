"""按网页相同的坐标绘制题图，不执行 SVG 或外部图片地址。"""
from reportlab.lib.colors import HexColor


def draw_diagram(pdf, diagram, left, top, scale=.6):
    pdf.saveState()
    pdf.setStrokeColor(HexColor("#17334c"))
    pdf.setLineWidth(2 * scale)
    def point(x, y):
        return left + x * scale, top - y * scale
    for element in diagram["elements"]:
        kind = element["kind"]
        pdf.setDash(6 * scale, 5 * scale) if element.get("dashed") else pdf.setDash()
        if kind == "text":
            pdf.setFillColor(HexColor("#17334c"))
            pdf.setFont("DiagnosisCN", 15 * scale)
            pdf.drawCentredString(*point(element["x"], element["y"]), element["text"])
        elif kind == "line":
            pdf.line(*point(element["x1"], element["y1"]), *point(element["x2"], element["y2"]))
        elif kind == "circle":
            pdf.circle(*point(element["cx"], element["cy"]), element["r"] * scale, fill=0, stroke=1)
        elif kind == "sector":
            cx, cy = point(element["cx"], element["cy"])
            radius = element["r"] * scale
            pdf.setFillColor(HexColor(element["fill"]))
            # PDF 的 y 轴向上；取相反角度，保持与网页相同的顺时针方向。
            pdf.wedge(cx-radius, cy-radius, cx+radius, cy+radius, -element["startAngle"],
                      -(element["endAngle"]-element["startAngle"]), fill=1, stroke=1)
        elif kind == "polygon":
            path = pdf.beginPath()
            for index, coords in enumerate(element["points"]):
                path.moveTo(*point(*coords)) if index == 0 else path.lineTo(*point(*coords))
            path.close()
            fill = element.get("fill", "none")
            if fill != "none":
                pdf.setFillColor(HexColor(fill))
            pdf.drawPath(path, fill=int(fill != "none"), stroke=1)
    pdf.restoreState()
