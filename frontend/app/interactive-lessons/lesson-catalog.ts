export type LessonStage = "七年级数学" | "八年级数学" | "八年级物理";
export type LessonSource = "自制互动";
export type LessonStatus = "可学习";

export type InteractiveLesson = {
  id: string;
  stage: LessonStage;
  semester: "上册" | "下册";
  chapter: string;
  title: string;
  description: string;
  keyPoints: string[];
  image: string;
  source: LessonSource;
  status: LessonStatus;
  localPath?: string;
  studyPrompt: string;
};

const lessonRoutes: Record<string, string> = {
  "g7-upper-equations": "/interactive-lessons/sims/equation-lab.html"
};

export function resolveLocalLessonRoute(id: string, legacyAsset: string) {
  if (lessonRoutes[id]) {
    return lessonRoutes[id];
  }
  if (legacyAsset.endsWith(".html")) {
    return `/interactive-lessons/sims/${legacyAsset}`;
  }
  return `/interactive-lessons/sims/concept-studio.html?lesson=${id}`;
}

const localLesson = (
  id: string,
  stage: LessonStage,
  semester: "上册" | "下册",
  chapter: string,
  title: string,
  description: string,
  keyPoints: string[],
  image: string,
  legacyAsset: string,
  studyPrompt: string
): InteractiveLesson => ({
  id,
  stage,
  semester,
  chapter,
  title,
  description,
  keyPoints,
  image: `/interactive-lessons/images/${image}`,
  source: "自制互动",
  status: "可学习",
  localPath: resolveLocalLessonRoute(id, legacyAsset),
  studyPrompt
});

const preparedLesson = (
  id: string,
  stage: LessonStage,
  chapter: string,
  title: string,
  description: string,
  keyPoints: string[],
  image: string
): InteractiveLesson => ({
  id,
  stage,
  semester: "上册",
  chapter,
  title,
  description,
  keyPoints,
  image: `/interactive-lessons/images/${image}`,
  source: "自制互动",
  status: "可学习",
  localPath: resolveLocalLessonRoute(id, "concept-studio"),
  studyPrompt: "完成实验后，写下参数变化与实验结果之间的关系。"
});

const preparedLessonWithSemester = (
  id: string,
  stage: LessonStage,
  semester: "上册" | "下册",
  chapter: string,
  title: string,
  description: string,
  keyPoints: string[],
  image: string
): InteractiveLesson => ({
  ...preparedLesson(id, stage, chapter, title, description, keyPoints, image),
  semester
});

export const interactiveLessons: InteractiveLesson[] = [
  localLesson("g7-upper-shapes", "七年级数学", "上册", "第一章", "丰富的图形世界", "生活中的立体图形、展开与折叠、截一个几何体、三视图。", ["正方体展开图", "截面形状", "主视图、左视图、俯视图"], "g7-ch1.jpg", "chapter1-shapes-world.html", "选一个立体图形，写出它的一个特征和一种观察方式。"),
  localLesson("g7-upper-integers", "七年级数学", "上册", "第二章", "有理数及其运算", "有理数分类、数轴、相反数、绝对值和四则运算。", ["数轴概念", "相反数", "绝对值", "有理数加减"], "g7-ch2.jpg", "chapter2-integers.html", "在数轴上完成四步挑战后，写下你发现的一个大小或运算规律。"),
  localLesson("g7-upper-algebra", "七年级数学", "上册", "第三章", "整式及其加减", "代数式、单项式与多项式、合并同类项、去括号和化简。", ["代数式", "同类项合并", "去括号法则"], "g7-ch3.jpg", "chapter3-algebra.html", "完成一组同类项合并，写下合并前必须先检查的条件。"),
  localLesson("g7-upper-plane-figures", "七年级数学", "上册", "第四章", "基本平面图形", "线段、射线、直线、角、多边形与圆的初步认识。", ["直线公理", "中点", "角平分线", "多边形", "扇形"], "g7-ch4.jpg", "chapter4-plane-figures.html", "画出一个角，并说明它属于锐角、直角、钝角或平角。"),
  localLesson("g7-upper-equations", "七年级数学", "上册", "第五章", "一元一次方程", "方程概念、等式基本性质、求解步骤和实际应用。", ["等式性质", "去分母", "移项", "合并", "实际应用题"], "g7-ch5.jpg", "unified-balance", "用天平模型操作一次，写下等式两边为什么要同时进行相同操作。"),
  localLesson("g7-upper-data", "七年级数学", "上册", "第六章", "数据的收集与整理", "普查与抽样、频数与频率、条形图、折线图和扇形图。", ["抽样", "频率", "三大统计图", "中位数", "众数"], "g7-ch6.jpg", "chapter6-data-statistics.html", "选择一种统计图，说明它最适合表达哪类数据。"),
  localLesson("g7-lower-polynomial", "七年级数学", "下册", "第一章", "整式的乘除", "幂运算、整式乘法和乘法公式。", ["幂运算", "整式乘法", "平方差公式", "完全平方公式"], "g7-ch7.jpg", "unified-area", "用面积模型解释一次两个代数式相乘的结果。"),
  localLesson("g7-lower-parallel", "七年级数学", "下册", "第二章", "相交线与平行线", "对顶角、垂线、平行线判定与性质。", ["对顶角相等", "平行线判定", "三线八角", "尺规作图"], "g7-ch8.jpg", "chapter7-2-parallel-lines.html", "改变截线位置，写下至少一组你观察到的角关系。"),
  localLesson("g7-lower-probability", "七年级数学", "下册", "第三章", "概率初步", "随机事件可能性、实验频率和等可能事件。", ["频率稳定于概率", "古典概型", "抛硬币", "掷骰子实验"], "g7-ch9.jpg", "unified-probability", "重复一次随机实验，记录次数增多后频率的变化。"),
  localLesson("g7-lower-triangle", "七年级数学", "下册", "第四章", "三角形", "边角关系、内角和、全等三角形判定。", ["边关系", "内角和", "SSS", "ASA", "AAS", "SAS"], "g7-ch10.jpg", "chapter7-4-triangle.html", "拖动三角形顶点后，写下三角形内角和是否改变以及原因。"),
  preparedLessonWithSemester("g7-lower-symmetry", "七年级数学", "下册", "第五章", "图形的轴对称", "通过拖动点和对称轴观察对应点的位置关系。", ["轴对称定义", "对称轴", "等腰三角形性质", "对称作图"], "g7-ch11.jpg"),
  localLesson("g7-lower-functions", "七年级数学", "下册", "第六章", "变量之间的关系", "自变量、因变量、表格、关系式和图像。", ["自变量", "因变量", "图像法", "实际意义读图"], "g7-ch12.jpg", "unified-function", "改变一个变量，写下另一个变量如何随之变化。"),
  preparedLesson("g8-math-pythagorean", "八年级数学", "第1-2课时", "勾股定理及逆定理", "割补法推导、勾股数和逆定理判定直角三角形。", ["勾股定理", "勾股逆定理", "勾股数"], "g8-math-ch1.jpg"),
  preparedLesson("g8-math-shortest-path", "八年级数学", "第3课时", "立体图形最短路径", "长方体、正方体表面展开求最短距离。", ["立体展开图", "两点间线段最短"], "g8-math-ch2.jpg"),
  preparedLesson("g8-math-real-numbers", "八年级数学", "第4-5课时", "无理数、平方根、立方根、实数", "实数分类、平方根、立方根和数轴对应。", ["无理数", "平方根", "立方根", "实数分类"], "g8-math-ch3.jpg"),
  localLesson("g8-math-coordinate", "八年级数学", "上册", "第6课时", "平面直角坐标系基础", "横轴纵轴、象限、根据坐标找点和由点写坐标。", ["坐标系", "象限", "坐标找点", "坐标轴点特征"], "g8-math-ch4.jpg", "unified-coordinate", "在不同象限各放置一个点，记录横纵坐标的正负号。"),
  preparedLessonWithSemester("g8-math-transform", "八年级数学", "上册", "第7课时", "坐标平移与轴对称变换", "拖动图形并观察平移、轴对称后的坐标变化。", ["平移", "轴对称", "坐标变化规律"], "g8-math-ch5.jpg"),
  localLesson("g8-math-function", "八年级数学", "上册", "第8课时", "变量与函数", "常量、变量、函数定义和三种表示方式。", ["常量", "变量", "函数定义", "定义域"], "g8-math-ch6.jpg", "unified-function", "写下一个自变量和因变量的现实生活例子。"),
  localLesson("g8-math-proportion", "八年级数学", "上册", "第8-9课时", "正比例函数图像与性质", "描点、过原点图像、增减性和比例系数。", ["正比例 y=kx", "图像", "增减性", "比例系数 k"], "g8-math-ch7.jpg", "unified-proportion", "改变比例系数 k，写下图像倾斜方向或陡峭程度的变化。"),
  localLesson("g8-math-linear", "八年级数学", "上册", "第10-11课时", "一次函数图像与参数含义", "一次函数画图、斜率、截距和实际应用。", ["y=kx+b", "斜率 k", "截距 b", "实际应用"], "g8-math-ch8.jpg", "unified-linear", "分别改变 k 和 b，写下它们各自影响图像的什么位置。"),
  localLesson("g8-math-graphs", "八年级数学", "上册", "第12课时", "函数图像综合复习", "综合练习函数图像和参数对图像的影响。", ["函数图像综合", "参数对图像影响"], "g8-math-ch9.jpg", "unified-graphs", "选一条图像，写下你能从图像读出的一个信息。"),
  preparedLessonWithSemester("g8-physics-measurement", "八年级物理", "上册", "第1课时", "测量与基础物理量", "使用可调刻度尺读取长度并理解分度值。", ["物理量", "测量工具", "误差", "有效数字"], "g8-phys-ch1.jpg"),
  preparedLessonWithSemester("g8-physics-motion", "八年级物理", "上册", "第2-4课时", "机械运动与运动图像", "控制小车速度和时间，观察运动与图像同步变化。", ["参照物", "匀速", "速度", "s-t 图", "v-t 图"], "g8-phys-ch2.jpg"),
  preparedLessonWithSemester("g8-physics-error", "八年级物理", "上册", "第3课时", "实验与误差分析", "模拟多次测量并比较平均值与真实值。", ["误差", "有效数字", "控制变量法"], "g8-phys-ch4.jpg"),
  localLesson("g8-physics-sound", "八年级物理", "上册", "第5-6课时", "声音的产生、传播与应用", "通过自研波形实验观察振幅、频率和波长。", ["振幅", "频率", "波长", "波的传播"], "g8-phys-ch5.jpg", "unified-wave", "改变波的参数，写下振幅、频率或波长的一个变化。"),
  localLesson("g8-physics-light", "八年级物理", "上册", "第8-11课时", "光学：光的折射与反射", "反射定律、折射定律、平面镜成像和光路图。", ["反射定律", "折射定律", "折射率", "平面镜成像"], "g8-phys-ch6.jpg", "unified-optics", "改变介质或角度，写下光线传播方向的变化。"),
  localLesson("g8-physics-wave", "八年级物理", "上册", "第8课时", "波动与光学基础", "波长、频率、干涉和衍射。", ["波的传播", "波长", "频率", "干涉"], "g8-phys-ch3.jpg", "unified-wave", "改变波源条件，写下波形的一个变化。"),
  localLesson("g8-physics-force", "八年级物理", "上册", "力学补充", "力与运动", "牛顿运动定律、合力、摩擦力和运动状态。", ["力", "合力", "牛顿定律", "摩擦力"], "g8-phys-ch7.jpg", "unified-force", "改变一个力的大小，写下物体运动状态如何改变。"),
  localLesson("g8-physics-light-review", "八年级物理", "上册", "第12课时", "光学综合训练", "光路图和折射反射综合分析。", ["光学综合", "光路作图", "折射反射综合"], "g8-phys-ch8.jpg", "unified-optics", "完成一次光路探索，写下本次最容易混淆的一条规律。")
];

export const lessonStages: LessonStage[] = ["七年级数学", "八年级数学", "八年级物理"];

export function getInteractiveLesson(lessonId: string) {
  return interactiveLessons.find((lesson) => lesson.id === lessonId);
}
