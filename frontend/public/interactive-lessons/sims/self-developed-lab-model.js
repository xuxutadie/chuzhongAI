(function (root, factory) {
    const model = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = model;
    if (root) root.SelfDevelopedLabModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const difficulties = [
        { id: "basic", label: "基础", range: 4, hint: "显示关键提示，参数变化较小" },
        { id: "advanced", label: "进阶", range: 8, hint: "减少提示，组合两个变量" },
        { id: "challenge", label: "挑战", range: 12, hint: "扩大参数范围，完成迁移任务" }
    ];

    const scenePresets = {
        shapes: [{ key: "turn", label: "模型水平旋转", min: 0, max: 360, step: 15, value: 30 }, { key: "slice", label: "截面位置", min: 15, max: 85, step: 5, value: 50 }],
        numberline: [{ key: "value", label: "数轴上的点", min: -10, max: 10, step: 1, value: -2 }, { key: "move", label: "移动单位", min: -8, max: 8, step: 1, value: 3 }],
        algebra: [{ key: "x", label: "x 的值", min: -6, max: 8, step: 1, value: 3 }, { key: "constant", label: "常数项", min: -8, max: 8, step: 1, value: 2 }],
        angle: [{ key: "angle", label: "角度", min: 10, max: 170, step: 5, value: 55 }, { key: "length", label: "边长", min: 2, max: 9, step: 1, value: 6 }],
        balance: [{ key: "left", label: "左侧砝码", min: 1, max: 10, step: 1, value: 5 }, { key: "right", label: "右侧砝码", min: 1, max: 10, step: 1, value: 7 }],
        chart: [{ key: "samples", label: "样本数量", min: 10, max: 100, step: 10, value: 40 }, { key: "group", label: "分组数量", min: 3, max: 8, step: 1, value: 5 }],
        area: [{ key: "a", label: "第一项", min: 1, max: 8, step: 1, value: 4 }, { key: "b", label: "第二项", min: 1, max: 8, step: 1, value: 3 }],
        parallel: [{ key: "angle", label: "已知角", min: 20, max: 160, step: 5, value: 65 }, { key: "offset", label: "截线位置", min: 20, max: 80, step: 5, value: 50 }],
        probability: [{ key: "trials", label: "实验次数", min: 10, max: 200, step: 10, value: 50 }, { key: "chance", label: "事件概率", min: 10, max: 90, step: 5, value: 50 }],
        triangle: [{ key: "a", label: "底边", min: 3, max: 10, step: 1, value: 7 }, { key: "height", label: "顶点高度", min: 2, max: 9, step: 1, value: 6 }],
        symmetry: [{ key: "offset", label: "点到对称轴距离", min: 1, max: 8, step: 1, value: 4 }, { key: "axis", label: "对称轴位置", min: 30, max: 70, step: 5, value: 50 }],
        function: [{ key: "k", label: "变化率 k", min: -5, max: 5, step: 0.5, value: 1.5 }, { key: "b", label: "初始值 b", min: -6, max: 6, step: 1, value: 2 }],
        pythagorean: [{ key: "a", label: "直角边 a", min: 3, max: 12, step: 1, value: 3 }, { key: "b", label: "直角边 b", min: 3, max: 12, step: 1, value: 4 }],
        path: [{ key: "width", label: "展开面宽", min: 3, max: 12, step: 1, value: 8 }, { key: "height", label: "展开面高", min: 3, max: 12, step: 1, value: 6 }],
        real: [{ key: "radicand", label: "被开方数", min: 2, max: 50, step: 1, value: 8 }, { key: "precision", label: "估算精度", min: 1, max: 3, step: 1, value: 2 }],
        coordinate: [{ key: "x", label: "横坐标 x", min: -8, max: 8, step: 1, value: 3 }, { key: "y", label: "纵坐标 y", min: -8, max: 8, step: 1, value: 4 }],
        transform: [{ key: "dx", label: "水平移动", min: -6, max: 6, step: 1, value: 3 }, { key: "dy", label: "竖直移动", min: -6, max: 6, step: 1, value: -2 }],
        quadratic: [{ key: "a", label: "开口参数 a", min: -3, max: 3, step: 0.5, value: 1 }, { key: "b", label: "水平位置", min: -5, max: 5, step: 1, value: 0 }],
        measurement: [{ key: "value", label: "物体长度", min: 10, max: 95, step: 1, value: 63 }, { key: "scale", label: "分度值", min: 1, max: 5, step: 1, value: 2 }],
        motion: [{ key: "speed", label: "速度", min: 1, max: 12, step: 1, value: 5 }, { key: "time", label: "时间", min: 1, max: 10, step: 1, value: 6 }],
        error: [{ key: "trueValue", label: "真实值", min: 20, max: 90, step: 1, value: 60 }, { key: "error", label: "测量偏差", min: -5, max: 5, step: 0.5, value: 2 }],
        wave: [{ key: "amplitude", label: "振幅", min: 1, max: 8, step: 0.5, value: 4 }, { key: "frequency", label: "频率", min: 1, max: 8, step: 0.5, value: 3 }],
        optics: [{ key: "angle", label: "入射角", min: 5, max: 75, step: 5, value: 35 }, { key: "index", label: "介质折射率", min: 1, max: 2, step: 0.1, value: 1.5 }],
        force: [{ key: "force", label: "推力", min: 0, max: 20, step: 1, value: 12 }, { key: "friction", label: "摩擦力", min: 0, max: 15, step: 1, value: 5 }]
    };

    function define(title, scene, colors, mission, question, options, answer) {
        return {
            title,
            scene,
            colors,
            mission,
            controls: scenePresets[scene],
            levels: [
                `跟随提示完成“${mission}”并观察一个变量。`,
                `同时调整两个参数，解释“${mission}”中的变化规律。`,
                `隐藏部分提示，自主完成“${mission}”并回答迁移问题。`
            ],
            challenge: { question, options, answer }
        };
    }

    const shapeDifficultyProfiles = {
        basic: {
            mode: "跟着做",
            hint: "认识四类核心内容",
            summary: "按提示认识立体图形、展开折叠、几何截面和三视图，逐步完成整章探索。",
            prompt: "先按当前实验的三步指引操作，再根据画面完成自检。",
            controls: [
                { key: "turn", label: "模型水平旋转", min: 0, max: 120, step: 15, value: 30 },
                { key: "slice", label: "截面位置", min: 35, max: 65, step: 5, value: 50 }
            ],
            stages: [
                { title: "拖动看立体", task: "① 按住模型向任意方向拖动，先看清立方体的棱和透明切面。" },
                { title: "移动数交点", task: "② 调整“截面位置”，逐个数粉色切面与立方体棱的发光交点。" },
                { title: "看图做判断", task: "③ 回到中间位置 50，根据发光交点数量完成自检。" }
            ],
            challenge: { question: "切面位于立方体中央时，画面中有几个发光交点？", options: ["6 个", "4 个", "3 个"], answer: "6 个" },
            requiredSlice: 50
        },
        advanced: {
            mode: "对比找规律",
            hint: "跨模型比较结构",
            summary: "在四类实验中比较不同立体、折叠状态、截面和视图，找出结构规律。",
            prompt: "至少完成两次不同操作并比较结果，再进入自检。",
            controls: [
                { key: "turn", label: "模型水平旋转", min: 0, max: 360, step: 15, value: 30 },
                { key: "slice", label: "截面位置", min: 15, max: 85, step: 5, value: 50 }
            ],
            stages: [
                { title: "记录中心截面", task: "① 拖动模型，从不同方向确认中心切面有 6 个交点。" },
                { title: "比较两种截面", task: "② 把截面位置调到 15 或 85，对比三角形和六边形。" },
                { title: "说出变化规律", task: "③ 根据两次观察，判断切面向顶点移动时形状怎样变化。" }
            ],
            challenge: { question: "切面从立方体中心移向一个顶点时，截面通常怎样变化？", options: ["六边形变为三角形", "三角形变为圆", "始终是正方形"], answer: "六边形变为三角形" }
        },
        challenge: {
            mode: "综合闯关",
            hint: "独立完成实验目标",
            summary: "隐藏关键数值和位置提示，在四类实验中独立达到目标并解释判断依据。",
            prompt: "根据当前实验的目标独立操作；没有达到目标时不能通过本关。",
            controls: [
                { key: "turn", label: "模型水平旋转", min: 0, max: 360, step: 15, value: 30 },
                { key: "slice", label: "截面位置（不提示数值）", min: 15, max: 85, step: 5, value: 50, hideValue: true }
            ],
            stages: [
                { title: "独立探索", task: "① 不看位置答案，自由拖动视角并尝试移动切面。" },
                { title: "做出三角形", task: "② 继续调整，直到读数明确显示“三角形 · 3 个交点”。" },
                { title: "解释为什么", task: "③ 保持三角形截面，说明截面边数与相交棱数的关系。" }
            ],
            challenge: { question: "你做出的三角形截面同时穿过了立方体的几条棱？", options: ["3 条", "4 条", "6 条", "8 条"], answer: "3 条" },
            requiredShape: "三角形"
        }
    };

    const planeFigureDifficultyProfiles = {
        basic: {
            mode: "跟着做",
            hint: "认识四类核心平面图形",
            summary: "按提示认识线、角、多边形和圆，每个主题都完成观察、比较和判断。",
            prompt: "先按当前主题的三步指引操作，再根据画面完成自检。",
            controls: scenePresets.angle.map(control => ({ ...control }))
        },
        advanced: {
            mode: "对比找规律",
            hint: "比较结构和数量关系",
            summary: "通过切换类型和改变参数，比较平面图形的共同点与不同点。",
            prompt: "至少完成两次不同操作并比较结果，再进入自检。",
            controls: scenePresets.angle.map(control => ({ ...control, min: control.key === "angle" ? 0 : control.min, max: control.key === "angle" ? 180 : control.max }))
        },
        challenge: {
            mode: "综合闯关",
            hint: "根据特征独立判断",
            summary: "减少结论提示，通过图形特征、数量关系和动态变化独立完成判断。",
            prompt: "根据当前主题目标独立操作，达到要求后再完成自检。",
            controls: scenePresets.angle.map(control => ({ ...control, min: control.key === "angle" ? 0 : control.min, max: control.key === "angle" ? 180 : control.max, step: control.key === "angle" ? 1 : control.step }))
        }
    };

    const lessons = {
        "g7-upper-shapes": Object.assign(define("丰富的图形世界", "shapes", ["#2f80ed", "#ff5d8f"], "旋转立方体并移动真实切割平面", "切面同时穿过正方体六条棱时，截面是什么形状？", ["六边形", "三角形", "圆", "正方形"], "六边形"), { difficultyProfiles: shapeDifficultyProfiles }),
        "g7-upper-integers": define("有理数及其运算", "numberline", ["#2f80ed", "#7c3aed"], "拖动数轴点并完成一次移动", "数轴上越靠右的数怎样？", ["越大", "越小", "不变", "无法判断"], "越大"),
        "g7-upper-algebra": define("整式及其加减", "algebra", ["#7c3aed", "#ff5d8f"], "用代数砖合并同类项", "3x 与 2x 合并后是？", ["5x", "6x", "5x²", "x"], "5x"),
        "g7-upper-plane-figures": Object.assign(define("基本平面图形", "angle", ["#f59e0b", "#2f80ed"], "探索线、角、多边形和圆的结构", "小于 90° 的角是？", ["锐角", "直角", "钝角", "平角"], "锐角"), { difficultyProfiles: planeFigureDifficultyProfiles }),
        "g7-upper-equations": define("一元一次方程", "balance", ["#ff5d8f", "#7c3aed"], "让天平两侧保持相等", "等式两边同时加 2，等式是否仍成立？", ["成立", "不成立", "只左边成立", "无法判断"], "成立"),
        "g7-upper-data": define("数据的收集与整理", "chart", ["#14b8a6", "#f59e0b"], "改变样本量并观察统计图", "表示各部分占总体比例适合用？", ["扇形图", "折线图", "数轴", "方程"], "扇形图"),
        "g7-lower-polynomial": define("整式的乘除", "area", ["#7c3aed", "#f59e0b"], "用四区域面积模型展开两个多项式", "(x+a)(x+b) 展开后，一次项系数是？", ["a+b", "ab", "a-b", "1"], "a+b"),
        "g7-lower-parallel": define("相交线与平行线", "parallel", ["#2f80ed", "#f59e0b"], "移动截线并观察角关系", "两直线平行时，同位角？", ["相等", "互余", "互补", "无关"], "相等"),
        "g7-lower-probability": define("概率初步", "probability", ["#ff5d8f", "#f59e0b"], "运行随机实验并比较频率", "大量重复试验后，频率通常？", ["接近概率", "一定为 0", "一定为 1", "越来越乱"], "接近概率"),
        "g7-lower-triangle": define("三角形", "triangle", ["#14b8a6", "#7c3aed"], "拖动顶点并观察三角形", "三角形内角和是？", ["180°", "90°", "270°", "360°"], "180°"),
        "g7-lower-symmetry": define("图形的轴对称", "symmetry", ["#ff5d8f", "#2f80ed"], "移动点并生成轴对称点", "对称点到对称轴的距离？", ["相等", "一半", "两倍", "不确定"], "相等"),
        "g7-lower-functions": define("变量之间的关系", "function", ["#2f80ed", "#f59e0b"], "改变变量并观察对应值", "函数中主动变化的量叫？", ["自变量", "因变量", "常量", "单位"], "自变量"),
        "g8-math-pythagorean": define("勾股定理及逆定理", "pythagorean", ["#7c3aed", "#14b8a6"], "调整直角边并比较三个正方形面积", "直角三角形满足？", ["a²+b²=c²", "a+b=c", "a²-b²=c²", "ab=c"], "a²+b²=c²"),
        "g8-math-shortest-path": define("立体图形最短路径", "path", ["#f59e0b", "#2f80ed"], "展开表面并连接最短路线", "平面内两点之间什么最短？", ["线段", "折线", "曲线", "圆弧"], "线段"),
        "g8-math-real-numbers": define("无理数、平方根、立方根、实数", "real", ["#7c3aed", "#ff5d8f"], "估算根号并定位到数轴", "√2 属于？", ["无理数", "整数", "自然数", "负数"], "无理数"),
        "g8-math-coordinate": define("平面直角坐标系基础", "coordinate", ["#2f80ed", "#ff5d8f"], "拖动坐标点并判断象限", "点 (3,4) 位于？", ["第一象限", "第二象限", "第三象限", "第四象限"], "第一象限"),
        "g8-math-transform": define("坐标平移与轴对称变换", "transform", ["#ff5d8f", "#7c3aed"], "平移图形并比较坐标变化", "向右平移 3 个单位，横坐标？", ["加 3", "减 3", "不变", "乘 3"], "加 3"),
        "g8-math-function": define("变量与函数", "function", ["#14b8a6", "#2f80ed"], "调整函数参数并读取表格", "y=2x 中，x 增加 1，y 增加？", ["2", "1", "0", "4"], "2"),
        "g8-math-proportion": define("正比例函数图像与性质", "function", ["#2f80ed", "#f59e0b"], "改变 k 并观察直线倾斜", "正比例函数图像一定经过？", ["原点", "(1,1)", "x 轴正半轴", "任意点"], "原点"),
        "g8-math-linear": define("一次函数图像与参数含义", "function", ["#7c3aed", "#ff5d8f"], "分别改变 k 与 b", "y=kx+b 中 b 表示？", ["纵轴截距", "斜率", "自变量", "定义域"], "纵轴截距"),
        "g8-math-graphs": define("函数图像综合复习", "quadratic", ["#ff5d8f", "#f59e0b"], "调整参数并识别图像特征", "a>0 时抛物线开口？", ["向上", "向下", "向左", "向右"], "向上"),
        "g8-physics-measurement": define("测量与基础物理量", "measurement", ["#2f80ed", "#f59e0b"], "移动物体并读取刻度", "刻度尺读数需要估读到？", ["分度值下一位", "个位", "任意位", "不用估读"], "分度值下一位"),
        "g8-physics-motion": define("机械运动与运动图像", "motion", ["#14b8a6", "#ff5d8f"], "改变速度并观察路程图像", "匀速直线运动的 s-t 图像是？", ["直线", "圆", "抛物线", "无规律"], "直线"),
        "g8-physics-error": define("实验与误差分析", "error", ["#f59e0b", "#7c3aed"], "多次测量并比较误差", "多次测量取平均值通常能？", ["减小偶然误差", "消除所有误差", "增大误差", "改变真实值"], "减小偶然误差"),
        "g8-physics-sound": define("声音的产生、传播与应用", "wave", ["#7c3aed", "#14b8a6"], "调整频率和振幅观察声波", "振幅主要影响声音的？", ["响度", "音调", "传播速度", "音色来源"], "响度"),
        "g8-physics-light": define("光学：光的折射与反射", "optics", ["#f59e0b", "#2f80ed"], "改变入射角和介质观察光路", "反射角与入射角？", ["相等", "互余", "无关", "总为 0"], "相等"),
        "g8-physics-wave": define("波动与光学基础", "wave", ["#2f80ed", "#ff5d8f"], "控制波源并观察波形", "频率增大时，同速波的波长？", ["变短", "变长", "不变", "为零"], "变短"),
        "g8-physics-force": define("力与运动", "force", ["#ff5d8f", "#14b8a6"], "改变推力和摩擦力观察运动", "推力大于摩擦力时合力方向？", ["推力方向", "摩擦力方向", "竖直向上", "合力为零"], "推力方向"),
        "g8-physics-light-review": define("光学综合训练", "optics", ["#7c3aed", "#f59e0b"], "综合调整光路并判断折射", "光从空气斜射入水中通常向哪里偏折？", ["法线", "界面", "原路", "任意方向"], "法线")
    };

    function getDifficulty(id) {
        return difficulties.find(item => item.id === id) || difficulties[0];
    }

    function createSession(lessonId, difficultyId) {
        const resolvedLessonId = lessons[lessonId] ? lessonId : Object.keys(lessons)[0];
        const lesson = lessons[resolvedLessonId];
        const difficulty = getDifficulty(difficultyId);
        const levelIndex = difficulties.findIndex(item => item.id === difficulty.id);
        const difficultyScale = [0.45, 0.72, 1][levelIndex];
        const profile = lesson.difficultyProfiles && lesson.difficultyProfiles[difficulty.id];
        return {
            lessonId: resolvedLessonId,
            difficulty: difficulty.id,
            range: difficulty.range,
            prompt: profile ? profile.prompt : lesson.levels[levelIndex],
            lesson,
            profile: profile || null,
            controls: profile ? profile.controls.map(control => ({ ...control })) : lesson.controls.map(control => {
                const stepsEachSide = Math.max(1, Math.floor(((control.max - control.min) / control.step) * difficultyScale / 2));
                const halfRange = stepsEachSide * control.step;
                return {
                    ...control,
                    min: Math.max(control.min, Number((control.value - halfRange).toFixed(2))),
                    max: Math.min(control.max, Number((control.value + halfRange).toFixed(2)))
                };
            })
        };
    }

    return { difficulties, lessons, getDifficulty, createSession };
});
