(function (root, factory) {
    const model = factory();
    if (typeof module !== "undefined" && module.exports) module.exports = model;
    if (root) root.InteractiveLessonQualityModel = model;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";

    const lessonScenes = {
        "g7-upper-shapes": "shapes",
        "g7-upper-integers": "numberline",
        "g7-upper-algebra": "algebra",
        "g7-upper-plane-figures": "angle",
        "g7-upper-equations": "equation",
        "g7-upper-data": "chart",
        "g7-lower-polynomial": "area",
        "g7-lower-parallel": "parallel",
        "g7-lower-probability": "probability",
        "g7-lower-triangle": "triangle",
        "g7-lower-symmetry": "symmetry",
        "g7-lower-functions": "function",
        "g8-math-pythagorean": "pythagorean",
        "g8-math-shortest-path": "path",
        "g8-math-real-numbers": "real",
        "g8-math-coordinate": "coordinate",
        "g8-math-transform": "transform",
        "g8-math-function": "function-table",
        "g8-math-proportion": "proportion",
        "g8-math-linear": "linear",
        "g8-math-graphs": "graph-review",
        "g8-physics-measurement": "measurement",
        "g8-physics-motion": "motion",
        "g8-physics-error": "error",
        "g8-physics-sound": "sound",
        "g8-physics-light": "optics",
        "g8-physics-wave": "wave",
        "g8-physics-force": "force",
        "g8-physics-light-review": "optics-review"
    };

    const dedicatedRoutes = {
        "g7-upper-equations": "/interactive-lessons/sims/equation-lab.html"
    };

    const requirements = {
        difficultyIds: ["basic", "advanced", "challenge"],
        stageIds: ["observe", "experiment", "verify"],
        requiredCapabilities: ["专属可视化", "参数可操作", "错误反馈", "即时自检", "完成回传"],
        desktopViewport: { width: 1440, height: 900 },
        mobileViewport: { width: 390, height: 844 }
    };

    function routeFor(lessonId) {
        return dedicatedRoutes[lessonId] || `/interactive-lessons/sims/concept-studio.html?lesson=${lessonId}`;
    }

    function auditLesson(lessonId, lesson) {
        const failures = [];
        if (!lesson) failures.push("缺少课件配置");
        if (!lessonScenes[lessonId]) failures.push("缺少专属可视化场景");
        if (!lesson || !Array.isArray(lesson.levels) || lesson.levels.length !== 3) failures.push("难度不是三级");
        if (!lesson || !lesson.challenge || !lesson.challenge.answer) failures.push("缺少即时自检答案");
        if (!lesson || !Array.isArray(lesson.controls) || lesson.controls.length < 2) failures.push("可操作参数少于两个");
        return { lessonId, passed: failures.length === 0, failures };
    }

    return { lessonScenes, requirements, routeFor, auditLesson };
});
