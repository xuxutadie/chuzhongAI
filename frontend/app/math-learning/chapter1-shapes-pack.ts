import type {
  MathDifficulty,
  MathKnowledgePackage,
  MathQuestion,
  MathQuestionOption,
  MathVisualSpec
} from "./types";

const option = (id: string, text: string): MathQuestionOption => ({ id, text });

function choice(
  id: string,
  knowledgePointId: string,
  capabilityTag: string,
  difficulty: MathDifficulty,
  prompt: string,
  options: MathQuestionOption[],
  correctAnswer: string,
  explanation: string,
  visual?: MathVisualSpec
): MathQuestion {
  return {
    id,
    knowledgePointId,
    capabilityTag,
    difficulty,
    responseType: "single-choice",
    prompt,
    options,
    correctAnswer,
    explanation,
    visual,
    source: "local-reviewed"
  };
}

function trueFalse(
  id: string,
  knowledgePointId: string,
  capabilityTag: string,
  difficulty: MathDifficulty,
  prompt: string,
  correct: boolean,
  explanation: string,
  visual?: MathVisualSpec
): MathQuestion {
  return {
    id,
    knowledgePointId,
    capabilityTag,
    difficulty,
    responseType: "true-false",
    prompt,
    options: [option("true", "正确"), option("false", "错误")],
    correctAnswer: correct ? "true" : "false",
    explanation,
    visual,
    source: "local-reviewed"
  };
}

function multiple(
  id: string,
  knowledgePointId: string,
  capabilityTag: string,
  difficulty: MathDifficulty,
  prompt: string,
  options: MathQuestionOption[],
  correctAnswer: string[],
  explanation: string,
  visual?: MathVisualSpec
): MathQuestion {
  return {
    id,
    knowledgePointId,
    capabilityTag,
    difficulty,
    responseType: "multi-choice",
    prompt,
    options,
    correctAnswer,
    explanation,
    visual,
    source: "local-reviewed"
  };
}

function interactive(
  id: string,
  knowledgePointId: string,
  capabilityTag: string,
  difficulty: MathDifficulty,
  prompt: string,
  challengeId: string,
  explanation: string,
  visual: MathVisualSpec
): MathQuestion {
  return {
    id,
    knowledgePointId,
    capabilityTag,
    difficulty,
    responseType: "interactive",
    prompt,
    correctAnswer: { challengeId, passed: true },
    explanation,
    visual,
    source: "local-reviewed"
  };
}

const solidId = "g7u-shapes-solid";
const solidQuestions: MathQuestion[] = [
  choice("solid-01", solidId, "实物抽象", "basic", "篮球可以近似看成哪一种立体图形？", [option("a", "球"), option("b", "圆柱"), option("c", "圆锥"), option("d", "正方体")], "a", "篮球的外形可以近似抽象为球。"),
  choice("solid-02", solidId, "结构计数", "basic", "一个正方体有多少个面？", [option("a", "4个"), option("b", "6个"), option("c", "8个"), option("d", "12个")], "b", "正方体有6个大小相同的正方形面。", { kind: "solid-model", solid: "cube" }),
  trueFalse("solid-03", solidId, "曲面认识", "basic", "球的表面全部是曲面。", true, "球没有平面，整个表面都是曲面。", { kind: "solid-model", solid: "sphere" }),
  multiple("solid-04", solidId, "分类辨析", "advanced", "下列几何体中，含有曲面的有哪些？", [option("a", "圆柱"), option("b", "圆锥"), option("c", "正方体"), option("d", "球")], ["a", "b", "d"], "圆柱、圆锥和球都含有曲面，正方体只含平面。"),
  choice("solid-05", solidId, "结构计数", "advanced", "一个正方体有多少条棱？", [option("a", "6条"), option("b", "8条"), option("c", "12条"), option("d", "16条")], "c", "正方体共有12条棱。", { kind: "solid-model", solid: "cube" }),
  trueFalse("solid-06", solidId, "结构辨析", "advanced", "圆柱有两个互相平行且大小相同的圆形底面。", true, "圆柱的两个底面是互相平行且大小相同的圆。", { kind: "solid-model", solid: "cylinder" }),
  multiple("solid-07", solidId, "实物抽象", "challenge", "下列物体可以近似看成长方体的有哪些？", [option("a", "书本"), option("b", "鞋盒"), option("c", "篮球"), option("d", "易拉罐")], ["a", "b"], "书本和鞋盒通常可以近似抽象成长方体。"),
  choice("solid-08", solidId, "组合体分析", "challenge", "把一个圆柱放在一个正方体上组成组合体，两个几何体接触处的面最接近什么形状？", [option("a", "圆"), option("b", "三角形"), option("c", "正方形"), option("d", "扇形")], "a", "圆柱底面是圆，接触区域最接近圆。"),
  interactive("solid-09", solidId, "旋转观察", "advanced", "旋转正方体，找到并确认它的面、棱和顶点。", "solid-cube-parts", "通过旋转可以从不同方向确认正方体的6个面、12条棱和8个顶点。", { kind: "solid-model", solid: "cube" }),
  interactive("solid-10", solidId, "曲面观察", "challenge", "旋转圆柱，分别指出两个底面和一个侧面。", "solid-cylinder-surfaces", "圆柱由两个圆形底面和一个曲面侧面围成。", { kind: "solid-model", solid: "cylinder" })
];

const foldingId = "g7u-shapes-folding";
const foldingQuestions: MathQuestion[] = [
  choice("fold-01", foldingId, "展开图组成", "basic", "正方体的完整展开图由几个大小相同的正方形组成？", [option("a", "4个"), option("b", "5个"), option("c", "6个"), option("d", "8个")], "c", "正方体有6个面，因此完整展开图由6个正方形组成。"),
  trueFalse("fold-02", foldingId, "展开图判断", "basic", "任意六个相连的正方形都能折成正方体。", false, "六个正方形的相对位置必须满足折叠后不重叠、也不缺面。", { kind: "folding-net", netId: "cube-cross" }),
  choice("fold-03", foldingId, "相对面判断", "advanced", "正方体折好后，两个相对面之间的关系是？", [option("a", "共用一条棱"), option("b", "只共用一个顶点"), option("c", "互相平行且不相邻"), option("d", "完全重合")], "c", "正方体的相对面互相平行且不相邻。", { kind: "folding-net", netId: "cube-cross" }),
  multiple("fold-04", foldingId, "折叠条件", "advanced", "判断一个图形能否折成正方体时，需要检查哪些条件？", [option("a", "是否恰好有6个正方形"), option("b", "折叠后是否有面重叠"), option("c", "是否能围成封闭立体"), option("d", "颜色是否相同")], ["a", "b", "c"], "数量、重叠和能否封闭是关键，颜色不影响几何折叠。"),
  trueFalse("fold-05", foldingId, "相邻面判断", "advanced", "展开图中共用一条边的两个正方形，折叠后对应的两个面一定相邻。", true, "共用的边会成为正方体的一条棱，因此两个面相邻。", { kind: "folding-net", netId: "cube-zigzag" }),
  choice("fold-06", foldingId, "折叠过程", "basic", "把展开图沿公共边折叠时，每个小正方形最终成为正方体的什么？", [option("a", "顶点"), option("b", "棱"), option("c", "面"), option("d", "对角线")], "c", "展开图中的每个正方形对应正方体的一个面。"),
  multiple("fold-07", foldingId, "展开图特征", "challenge", "一个有效的正方体展开图折叠后应满足哪些结果？", [option("a", "形成6个面"), option("b", "内部封闭"), option("c", "两个面完全重叠"), option("d", "每个面都是正方形")], ["a", "b", "d"], "有效展开图折叠后形成封闭正方体，6个正方形分别成为6个面。"),
  choice("fold-08", foldingId, "相对面判断", "challenge", "折叠正方体展开图时，已经确定为相对的两个面会怎样？", [option("a", "成为同一个面"), option("b", "互相平行"), option("c", "共用一条棱"), option("d", "互相垂直")], "b", "相对面在正方体中互相平行。", { kind: "folding-net", netId: "cube-t" }),
  interactive("fold-09", foldingId, "动态折叠", "advanced", "拖动折叠进度，把十字形展开图完整折成立方体。", "fold-cross-net", "折叠完成且各面不重叠，说明展开图有效。", { kind: "folding-net", netId: "cube-cross" }),
  interactive("fold-10", foldingId, "对应面定位", "challenge", "折叠展开图并选择与标记面相对的面。", "fold-opposite-face", "可以通过连续折叠追踪每个面的空间位置。", { kind: "folding-net", netId: "cube-zigzag", targetFace: "F" })
];

const sectionId = "g7u-shapes-section";
const sectionQuestions: MathQuestion[] = [
  choice("section-01", sectionId, "截面识别", "basic", "用平行于圆柱底面的平面截圆柱，截面是什么形状？", [option("a", "圆"), option("b", "三角形"), option("c", "梯形"), option("d", "扇形")], "a", "截面与圆柱底面平行，因此截面是圆。", { kind: "cross-section", solid: "cylinder", planePreset: "parallel-base" }),
  trueFalse("section-02", sectionId, "可能性判断", "basic", "用平面截球，只要平面与球相交，截面就是圆。", true, "球被任意相交平面截得的截面都是圆。", { kind: "cross-section", solid: "sphere", planePreset: "center" }),
  choice("section-03", sectionId, "不可能截面", "advanced", "用一个平面截正方体，下面哪种图形不可能成为截面？", [option("a", "三角形"), option("b", "正方形"), option("c", "六边形"), option("d", "圆")], "d", "正方体由平面围成，平面截得的边界由线段组成，不可能是圆。", { kind: "cross-section", solid: "cube", planePreset: "diagonal" }),
  multiple("section-04", sectionId, "可能截面", "advanced", "用平面截正方体，可能得到哪些截面？", [option("a", "三角形"), option("b", "四边形"), option("c", "五边形"), option("d", "六边形")], ["a", "b", "c", "d"], "改变截面位置和角度，可以得到三至六边形。"),
  trueFalse("section-05", sectionId, "截面变化", "advanced", "截面形状只由立体图形种类决定，与截取位置和角度无关。", false, "同一立体图形会因截取位置和角度不同产生不同截面。"),
  choice("section-06", sectionId, "圆锥截面", "basic", "用平行于圆锥底面的平面截圆锥，截面是什么形状？", [option("a", "圆"), option("b", "长方形"), option("c", "三角形"), option("d", "五边形")], "a", "与圆锥底面平行的截面是圆。", { kind: "cross-section", solid: "cone", planePreset: "parallel-base" }),
  multiple("section-07", sectionId, "圆柱截面", "challenge", "用不同方向的平面截圆柱，可能得到哪些常见截面？", [option("a", "圆"), option("b", "长方形"), option("c", "椭圆"), option("d", "正六边形")], ["a", "b", "c"], "平行、垂直或倾斜底面截取时，可得到圆、长方形或椭圆等。"),
  choice("section-08", sectionId, "截法反推", "challenge", "想从正方体截出六边形，截面至少需要穿过正方体的几个面？", [option("a", "3个"), option("b", "4个"), option("c", "5个"), option("d", "6个")], "d", "六边形截面的六条边分别位于正方体的六个面上。", { kind: "cross-section", solid: "cube", planePreset: "hexagon" }),
  interactive("section-09", sectionId, "截面操作", "advanced", "拖动截面平面，使正方体的截面成为三角形。", "cut-cube-triangle", "截面平面靠近一个顶点并穿过与该顶点相连的三条棱时，可得到三角形。", { kind: "cross-section", solid: "cube", planePreset: "vertex" }),
  interactive("section-10", sectionId, "截面变化", "challenge", "旋转并移动截面平面，找到正方体的六边形截面。", "cut-cube-hexagon", "截面同时穿过正方体六个面时可以形成六边形。", { kind: "cross-section", solid: "cube", planePreset: "hexagon" })
];

const viewsId = "g7u-shapes-views";
const viewQuestions: MathQuestion[] = [
  choice("views-01", viewsId, "观察方向", "basic", "从物体正面观察得到的图形称为什么？", [option("a", "主视图"), option("b", "左视图"), option("c", "俯视图"), option("d", "展开图")], "a", "从正面观察得到主视图。"),
  trueFalse("views-02", viewsId, "视图差异", "basic", "从不同方向观察同一个立体物体，看到的平面图形不一定相同。", true, "物体在不同方向上的轮廓和遮挡关系可能不同。"),
  multiple("views-03", viewsId, "标准视图", "basic", "学习从三个方向看物体时，通常包括哪些方向？", [option("a", "正面"), option("b", "左面"), option("c", "上面"), option("d", "物体内部")], ["a", "b", "c"], "标准的三个观察方向是正面、左面和上面。"),
  choice("views-04", viewsId, "尺寸理解", "advanced", "主视图主要反映物体的哪两个方向尺寸？", [option("a", "宽和高"), option("b", "宽和深"), option("c", "深和高"), option("d", "面积和体积")], "a", "从正面观察能反映物体的宽和高。", { kind: "orthographic-view", structureId: "stairs-01", view: "front" }),
  choice("views-05", viewsId, "尺寸理解", "advanced", "俯视图主要反映物体的哪两个方向尺寸？", [option("a", "宽和高"), option("b", "宽和深"), option("c", "深和高"), option("d", "棱长和体积")], "b", "从上面观察能反映物体的宽和深。", { kind: "orthographic-view", structureId: "stairs-01", view: "top" }),
  trueFalse("views-06", viewsId, "遮挡理解", "advanced", "只看一个方向的视图，通常不能唯一确定复杂立体结构。", true, "不同立体结构可能拥有相同的某一个方向视图。"),
  multiple("views-07", viewsId, "信息综合", "challenge", "要更完整地描述由小立方块搭成的物体，哪些信息有帮助？", [option("a", "主视图"), option("b", "左视图"), option("c", "俯视图"), option("d", "小立方块颜色")], ["a", "b", "c"], "三个方向的视图共同提供宽、高、深和遮挡信息。"),
  choice("views-08", viewsId, "位置分布", "challenge", "从上面观察由小立方块搭成的物体，最容易确定什么？", [option("a", "每列准确高度"), option("b", "底层位置分布"), option("c", "内部颜色"), option("d", "物体重量")], "b", "俯视图直接显示水平方向的位置分布，但不能独立给出每列高度。", { kind: "orthographic-view", structureId: "blocks-l-01", view: "top" }),
  interactive("views-09", viewsId, "视图匹配", "advanced", "旋转立体结构，选出与它一致的主视图。", "views-match-front", "主视图由正面轮廓和可见方块位置决定。", { kind: "orthographic-view", structureId: "stairs-01", view: "front" }),
  interactive("views-10", viewsId, "三视图重建", "challenge", "根据主视图、左视图和俯视图，选择正确的立体结构。", "views-rebuild-solid", "需要同时使用三个方向的信息排除只满足单一视图的结构。", { kind: "orthographic-view", structureId: "blocks-l-01", view: "left" })
];

export const chapter1ShapePackages: MathKnowledgePackage[] = [
  {
    id: solidId,
    subject: "数学",
    grade: 7,
    semester: "上册",
    textbookVersion: "北师大版",
    chapterId: "g7u-chapter-1",
    title: "生活中的立体图形",
    lessonId: "g7-upper-shapes",
    interaction: { section: "shapes", supportedDifficulties: ["basic", "advanced", "challenge"] },
    capabilityTags: ["实物抽象", "结构计数", "曲面认识", "旋转观察", "组合体分析"],
    questions: solidQuestions
  },
  {
    id: foldingId,
    subject: "数学",
    grade: 7,
    semester: "上册",
    textbookVersion: "北师大版",
    chapterId: "g7u-chapter-1",
    title: "展开与折叠",
    lessonId: "g7-upper-shapes",
    interaction: { section: "fold", supportedDifficulties: ["basic", "advanced", "challenge"] },
    capabilityTags: ["展开图组成", "展开图判断", "相对面判断", "动态折叠"],
    questions: foldingQuestions
  },
  {
    id: sectionId,
    subject: "数学",
    grade: 7,
    semester: "上册",
    textbookVersion: "北师大版",
    chapterId: "g7u-chapter-1",
    title: "截一个几何体",
    lessonId: "g7-upper-shapes",
    interaction: { section: "cut", supportedDifficulties: ["basic", "advanced", "challenge"] },
    capabilityTags: ["截面识别", "可能性判断", "截面变化", "截法反推"],
    questions: sectionQuestions
  },
  {
    id: viewsId,
    subject: "数学",
    grade: 7,
    semester: "上册",
    textbookVersion: "北师大版",
    chapterId: "g7u-chapter-1",
    title: "从三个方向看物体",
    lessonId: "g7-upper-shapes",
    interaction: { section: "views", supportedDifficulties: ["basic", "advanced", "challenge"] },
    capabilityTags: ["观察方向", "视图差异", "尺寸理解", "遮挡理解", "三视图重建"],
    questions: viewQuestions
  }
];

export function getMathKnowledgePackage(id: string) {
  return chapter1ShapePackages.find((knowledgePackage) => knowledgePackage.id === id) ?? null;
}
