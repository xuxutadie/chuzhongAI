(function () {
    "use strict";

    const baseModel = window.SelfDevelopedLabModel;
    const qualityModel = window.InteractiveLessonQualityModel;
    const engine = window.ConceptStudioEngine;
    const params = new URLSearchParams(window.location.search);
    const requestedId = params.get("lesson") || "g7-upper-shapes";
    const lessonId = baseModel.lessons[requestedId] ? requestedId : "g7-upper-shapes";
    const lesson = baseModel.lessons[lessonId];
    const scene = qualityModel.lessonScenes[lessonId];
    const isPlaneFigures = lessonId === "g7-upper-plane-figures";

    const palette = { blue:"#3185ff", pink:"#ff5b8f", purple:"#7c4dff", yellow:"#ffbd2e", mint:"#20c997", ink:"#19283b", muted:"#64748b", line:"#dbe5f1" };
    const stageDefinitions = [
        { id:"observe", title:"先看懂现象", task:"改变第一个参数，观察画面、公式和读数是否同步变化。" },
        { id:"experiment", title:"再验证规律", task:"同时改变两个条件，找出不随参数改变的核心规律。" },
        { id:"verify", title:"最后自己判断", task:"不看提示完成即时自检，并说明判断依据。" }
    ];
    const draggableScenes = new Set(["numberline","angle","coordinate","symmetry","transform","triangle","optics","optics-review","real"]);
    const sceneNames = {
        shapes:"立体图形互动实验室", numberline:"有理数数轴", algebra:"代数砖实验台", angle:"角度探究器",
        chart:"数据图表实验室", area:"面积拼图板", parallel:"平行线角关系", probability:"随机实验统计台",
        triangle:"可变三角形", symmetry:"轴对称镜面", function:"变量图像", "function-table":"函数表格与图像",
        proportion:"正比例函数图像", linear:"一次函数参数", "graph-review":"函数图像辨析", pythagorean:"勾股面积证明",
        path:"立体展开最短路径", real:"实数数轴定位", coordinate:"平面直角坐标系", transform:"坐标变换",
        measurement:"刻度尺测量", motion:"运动与图像", error:"多次测量与误差", sound:"声波实验台",
        wave:"波形实验台", optics:"反射与折射光路", force:"受力与运动", "optics-review":"光路综合训练"
    };

    const shapeModules = [
        { id:"solids", label:"认识立体", note:"观察面、棱和顶点" },
        { id:"nets", label:"展开与折叠", note:"把展开图折成立体" },
        { id:"sections", label:"截面实验", note:"观察切割后的平面" },
        { id:"views", label:"三视图", note:"从三个方向看物体" }
    ];
    const solidCatalog = {
        cube:{ label:"正方体", faces:6, edges:12, vertices:8, geometry:"cube" },
        cuboid:{ label:"长方体", faces:6, edges:12, vertices:8, geometry:"cuboid" },
        prism:{ label:"三棱柱", faces:5, edges:9, vertices:6, geometry:"prism" },
        pyramid:{ label:"四棱锥", faces:5, edges:8, vertices:5, geometry:"pyramid" },
        cylinder:{ label:"圆柱", faces:3, edges:2, vertices:0, geometry:"cylinder" },
        cone:{ label:"圆锥", faces:2, edges:1, vertices:1, geometry:"cone" },
        sphere:{ label:"球", faces:1, edges:0, vertices:0, geometry:"sphere" }
    };
    const shapeProfiles = baseModel.lessons["g7-upper-shapes"].difficultyProfiles;
    const shapeModuleLearning = {
        solids:{
            stages:{
                basic:[{title:"选择一个立体",task:"① 点击一种立体图形，拖动模型观察它的各个面。"},{title:"数面棱顶点",task:"② 再选择一种图形，对照面、棱、顶点数量进行比较。"},{title:"按特征判断",task:"③ 根据结构特征判断对应的立体图形。"}],
                advanced:[{title:"比较两类立体",task:"① 分别观察多面体和旋转体，找出平面与曲面的区别。"},{title:"记录结构差异",task:"② 至少切换三种模型，比较面、棱、顶点的数量。"},{title:"由特征反推",task:"③ 不看名称，根据结构数据判断立体图形。"}],
                challenge:[{title:"快速辨认",task:"① 自主切换模型并从任意角度观察。"},{title:"完成模型图鉴",task:"② 至少观察四种不同立体，记住它们的结构特征。"},{title:"综合推理",task:"③ 根据面、棱、顶点和曲面信息完成闯关。"}]
            },
            challenges:{basic:{question:"下列哪种立体图形没有棱，也没有顶点？",options:["球","正方体","圆锥"],answer:"球"},advanced:{question:"有 5 个面、9 条棱、6 个顶点的立体图形是？",options:["三棱柱","四棱锥","圆柱"],answer:"三棱柱"},challenge:{question:"只有一个底面、一个曲面和一个顶点的立体图形是？",options:["圆锥","圆柱","球","三棱柱"],answer:"圆锥"}}
        },
        nets:{
            stages:{
                basic:[{title:"看懂展开图",task:"① 拖动折叠进度，观察六个正方形怎样移动。"},{title:"折成立体",task:"② 把折叠进度调到 100%，确认六个面围成正方体。"},{title:"判断面数",task:"③ 根据展开与折叠过程完成自检。"}],
                advanced:[{title:"观察对应关系",task:"① 在半折叠状态下观察相邻面和相对面。"},{title:"来回折叠验证",task:"② 至少完成一次展开和一次完整折叠。"},{title:"判断展开图",task:"③ 根据面的连接关系作出判断。"}],
                challenge:[{title:"隐藏结果探索",task:"① 不看提示，自行控制折叠进度。"},{title:"完整闭合",task:"② 精确折叠到 100%，让六个面围成立体。"},{title:"解释折叠条件",task:"③ 判断什么样的平面图才能成为正方体展开图。"}]
            },
            challenges:{basic:{question:"一个正方体展开图由几个正方形组成？",options:["6 个","4 个","8 个"],answer:"6 个"},advanced:{question:"展开图中相邻的两个面折叠后一定怎样？",options:["共用一条棱","成为相对面","完全重合"],answer:"共用一条棱"},challenge:{question:"正方体展开图要成功折叠，六个面必须满足什么？",options:["不重叠并能封闭","排成一条直线","大小可以不同","必须互不相连"],answer:"不重叠并能封闭"}}
        },
        sections:{
            stages:{basic:shapeProfiles.basic.stages,advanced:shapeProfiles.advanced.stages,challenge:shapeProfiles.challenge.stages},
            challenges:{basic:shapeProfiles.basic.challenge,advanced:shapeProfiles.advanced.challenge,challenge:shapeProfiles.challenge.challenge}
        },
        views:{
            stages:{
                basic:[{title:"选择观察方向",task:"① 选择主视图、俯视图或左视图，观察相机方向变化。"},{title:"对照三个投影",task:"② 查看至少两个方向，比较轮廓为什么不同。"},{title:"认识三视图",task:"③ 根据观察方向完成基础判断。"}],
                advanced:[{title:"选择不同模型",task:"① 切换圆柱、圆锥或棱柱，观察它们的投影。"},{title:"查看全部方向",task:"② 完成主视图、俯视图和左视图三种观察。"},{title:"由视图猜模型",task:"③ 根据三个方向的轮廓反推立体图形。"}],
                challenge:[{title:"独立选模",task:"① 选择一种模型，不依赖名称观察轮廓。"},{title:"收集三视图",task:"② 查看主视图、俯视图和左视图，完成三方向记录。"},{title:"组合推理",task:"③ 综合三个投影完成模型辨认闯关。"}]
            },
            challenges:{basic:{question:"从物体正上方向下看到的图形叫？",options:["俯视图","主视图","左视图"],answer:"俯视图"},advanced:{question:"竖直放置的圆柱，主视图和俯视图通常分别是？",options:["长方形和圆","圆和长方形","两个三角形"],answer:"长方形和圆"},challenge:{question:"某立体的主视图和左视图是三角形、俯视图是圆，它最可能是？",options:["圆锥","圆柱","正方体","球"],answer:"圆锥"}}
        }
    };

    const planeModules = [
        { id:"lines", label:"线的家族", note:"线段、射线和直线" },
        { id:"angles", label:"角度实验", note:"拖动射线认识角" },
        { id:"polygons", label:"多边形", note:"比较边与顶点" },
        { id:"circles", label:"圆与扇形", note:"观察半径和圆心角" }
    ];
    const planeModuleLearning = {
        lines:{
            stages:{
                basic:[{title:"切换线的类型",task:"① 依次点击线段、射线和直线，观察端点与箭头。"},{title:"找到中点",task:"② 移动线段上的点到中央，观察两段长度怎样变化。"},{title:"看特征判断",task:"③ 根据端点和延伸方向完成判断。"}],
                advanced:[{title:"比较三种线",task:"① 快速切换三种线，记录端点和延伸方向。"},{title:"验证中点性质",task:"② 调整分点位置，找到左右长度相等的位置。"},{title:"用定义辨认",task:"③ 不看名称，根据图示特征完成判断。"}],
                challenge:[{title:"隐藏提示观察",task:"① 只看图形切换三种线，建立特征图像。"},{title:"精确找到中点",task:"② 把分点移动到 50%，验证两段相等。"},{title:"综合辨认",task:"③ 根据端点与箭头数量独立判断。"}]
            },
            challenges:{basic:{question:"有两个端点、不能向两端延伸的是？",options:["线段","射线","直线"],answer:"线段"},advanced:{question:"只有一个端点，并向一个方向无限延伸的是？",options:["射线","线段","直线"],answer:"射线"},challenge:{question:"没有端点，能向两个方向无限延伸的是？",options:["直线","射线","线段","圆弧"],answer:"直线"}}
        },
        angles:{
            stages:{
                basic:[{title:"拖动改变角度",task:"① 拖动角度滑块，观察活动射线和角弧同步变化。"},{title:"跨过九十度",task:"② 分别做出锐角和钝角，比较它们与直角的关系。"},{title:"判断角的类型",task:"③ 根据角度大小完成分类。"}],
                advanced:[{title:"做出四类角",task:"① 调整角度，观察锐角、直角、钝角和平角。"},{title:"比较临界位置",task:"② 在 90° 和 180° 附近观察分类怎样改变。"},{title:"只看数值判断",task:"③ 根据角度范围完成判断。"}],
                challenge:[{title:"精确控制射线",task:"① 使用小步长调整活动射线。"},{title:"命中目标角",task:"② 独立做出 90° 直角并保持。"},{title:"完成迁移判断",task:"③ 根据角度与分类边界完成闯关。"}]
            },
            challenges:{basic:{question:"小于 90° 的角是？",options:["锐角","直角","钝角"],answer:"锐角"},advanced:{question:"大于 90° 且小于 180° 的角是？",options:["钝角","锐角","平角"],answer:"钝角"},challenge:{question:"两条互相垂直的射线组成的角是？",options:["直角","锐角","钝角","平角"],answer:"直角"}}
        },
        polygons:{
            stages:{
                basic:[{title:"改变多边形边数",task:"① 从三角形开始增加边数，观察顶点同步增加。"},{title:"比较两种图形",task:"② 分别观察三角形和六边形，数清边与顶点。"},{title:"按数量判断",task:"③ 根据边数和顶点数完成判断。"}],
                advanced:[{title:"连续增加边数",task:"① 从 3 边调整到 8 边，观察轮廓变化。"},{title:"观察对角线",task:"② 比较不同边数时，从一个顶点能连出的对角线数量。"},{title:"总结数量关系",task:"③ 根据 n 边形的结构完成判断。"}],
                challenge:[{title:"自主选边数",task:"① 不看名称，只根据边和顶点辨认图形。"},{title:"完成八边形",task:"② 把边数准确调整到 8，观察全部顶点。"},{title:"综合数量推理",task:"③ 使用边、顶点和对角线关系完成闯关。"}]
            },
            challenges:{basic:{question:"五边形有几个顶点？",options:["5 个","4 个","6 个"],answer:"5 个"},advanced:{question:"从 n 边形的一个顶点，可连接多少条对角线？",options:["n-3 条","n-2 条","n 条"],answer:"n-3 条"},challenge:{question:"一个多边形有 8 条边，它有几个顶点？",options:["8 个","6 个","10 个","16 个"],answer:"8 个"}}
        },
        circles:{
            stages:{
                basic:[{title:"改变圆的半径",task:"① 调整半径，观察圆周上所有点到圆心的距离。"},{title:"改变圆心角",task:"② 拖动圆心角，观察扇形和对应圆弧同步变化。"},{title:"认识圆的结构",task:"③ 根据半径、圆心角和扇形完成判断。"}],
                advanced:[{title:"比较两个半径",task:"① 改变半径，比较圆的大小与直径。"},{title:"比较两种扇形",task:"② 分别做出小于和大于 180° 的扇形。"},{title:"总结对应关系",task:"③ 根据圆心角判断扇形占整圆的比例。"}],
                challenge:[{title:"自主控制圆",task:"① 同时改变半径和圆心角，观察两种变化。"},{title:"做出四分之一圆",task:"② 把圆心角准确调整到 90°。"},{title:"完成比例推理",task:"③ 根据圆心角与整圆 360° 的关系完成闯关。"}]
            },
            challenges:{basic:{question:"同一个圆中，所有半径的长度怎样？",options:["相等","不相等","无法比较"],answer:"相等"},advanced:{question:"180° 圆心角对应的扇形占整圆多少？",options:["二分之一","四分之一","三分之一"],answer:"二分之一"},challenge:{question:"圆心角为 90° 的扇形占整圆多少？",options:["四分之一","二分之一","四分之三","全部"],answer:"四分之一"}}
        }
    };

    let difficultyId = "basic";
    let session = baseModel.createSession(lessonId, difficultyId);
    let values = {};
    let currentStage = 0;
    let maxStage = 0;
    let changedKeys = new Set();
    let solved = false;
    let animationFrame = 0;
    let animationStart = 0;
    let pointerDown = false;
    let shape3d = null;
    let shapeHistory = new Set();
    let shapeModule = "solids";
    let shapeSolid = "cube";
    let shapeFold = 0;
    let shapeViewMode = "立体观察";
    let solidHistory = new Set(["cube"]);
    let viewHistory = new Set();
    let planeModule = "lines";
    let planeLineType = "segment";
    let planePoint = 35;
    let planeAngle = 55;
    let planeSides = 5;
    let planeSector = 100;
    let planeRadius = 6;
    let planeHistory = new Set();

    const el = {
        lessonTitle: document.getElementById("lessonTitle"), lessonSubtitle: document.getElementById("lessonSubtitle"),
        statusBadge: document.getElementById("statusBadge"), difficultyButtons: document.getElementById("difficultyButtons"),
        levelBrief: document.getElementById("levelBrief"), levelMode: document.getElementById("levelMode"), levelSummary: document.getElementById("levelSummary"),
        stepButtons: document.getElementById("stepButtons"), sceneName: document.getElementById("sceneName"),
        stageTitle: document.getElementById("stageTitle"), liveReadout: document.getElementById("liveReadout"),
        shapeModules: document.getElementById("shapeModules"), shapeGuide: document.getElementById("shapeGuide"), shapeOverlay: document.getElementById("shapeOverlay"),
        canvas: document.getElementById("sceneCanvas"), shapeCanvas: document.getElementById("shapeWebglCanvas"), canvasNote: document.getElementById("canvasNote"),
        missionText: document.getElementById("missionText"), controls: document.getElementById("controls"),
        playButton: document.getElementById("playButton"), resetButton: document.getElementById("resetButton"),
        advanceButton: document.getElementById("advanceButton"), coachText: document.getElementById("coachText"),
        challengeStatus: document.getElementById("challengeStatus"), challengeQuestion: document.getElementById("challengeQuestion"),
        answers: document.getElementById("answers"), feedback: document.getElementById("feedback")
    };
    const ctx = el.canvas.getContext("2d");

    function initializeValues() {
        values = Object.fromEntries(session.controls.map((control) => [control.key, control.value]));
        changedKeys = new Set();
        shapeHistory = new Set();
        if(scene==="shapes"){
            shapeHistory.add(engine.derive("shapes",values).shape);
            solidHistory=new Set([shapeSolid]);
            viewHistory=new Set();
            shapeFold=0;
            shapeViewMode="立体观察";
        }
        if(isPlaneFigures){
            planeLineType="segment";planePoint=35;planeAngle=55;planeSides=5;planeSector=100;planeRadius=6;
            planeHistory=new Set([`${planeModule}:initial`]);
        }
    }

    function roundRect(x,y,w,h,r,fill,stroke,lineWidth) {
        const radius = Math.min(r,w/2,h/2);
        ctx.beginPath(); ctx.roundRect(x,y,w,h,radius);
        if (fill) { ctx.fillStyle=fill; ctx.fill(); }
        if (stroke) { ctx.strokeStyle=stroke; ctx.lineWidth=lineWidth||2; ctx.stroke(); }
    }
    function line(x1,y1,x2,y2,color,width,dash) {
        ctx.beginPath(); ctx.setLineDash(dash||[]); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.strokeStyle=color; ctx.lineWidth=width||3; ctx.lineCap="round"; ctx.stroke(); ctx.setLineDash([]);
    }
    function circle(x,y,r,fill,stroke,width) { ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fillStyle=fill; ctx.fill(); if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width||2;ctx.stroke();} }
    function text(value,x,y,size,color,align,weight) { ctx.fillStyle=color||palette.ink; ctx.font=`${weight||800} ${size||18}px Microsoft YaHei`; ctx.textAlign=align||"center"; ctx.textBaseline="middle"; ctx.fillText(String(value),x,y); }
    function arrow(x1,y1,x2,y2,color,width) {
        line(x1,y1,x2,y2,color,width||4);
        const angle=Math.atan2(y2-y1,x2-x1),len=13;
        ctx.beginPath(); ctx.moveTo(x2,y2); ctx.lineTo(x2-len*Math.cos(angle-.55),y2-len*Math.sin(angle-.55)); ctx.lineTo(x2-len*Math.cos(angle+.55),y2-len*Math.sin(angle+.55)); ctx.closePath(); ctx.fillStyle=color; ctx.fill();
    }
    function fitCanvas() {
        const rect=el.canvas.getBoundingClientRect(),dpr=Math.min(2,window.devicePixelRatio||1);
        // 画布逻辑尺寸必须与实际显示尺寸一致，否则窄屏会把图形横向压扁，触控坐标也会偏移。
        const width=Math.max(1,Math.round(rect.width)),height=Math.max(1,Math.round(rect.height));
        if(el.canvas.width!==Math.round(width*dpr)||el.canvas.height!==Math.round(height*dpr)){el.canvas.width=Math.round(width*dpr);el.canvas.height=Math.round(height*dpr);}
        ctx.setTransform(dpr,0,0,dpr,0,0);
        return {w:width,h:height};
    }

    function activeStages() {
        if(scene==="shapes")return shapeModuleLearning[shapeModule].stages[difficultyId];
        if(isPlaneFigures)return planeModuleLearning[planeModule].stages[difficultyId];
        return session.profile&&session.profile.stages?session.profile.stages:stageDefinitions;
    }

    function activeChallenge() {
        if(scene==="shapes")return shapeModuleLearning[shapeModule].challenges[difficultyId];
        if(isPlaneFigures)return planeModuleLearning[planeModule].challenges[difficultyId];
        return session.profile&&session.profile.challenge?session.profile.challenge:lesson.challenge;
    }

    function currentShape() {
        return scene==="shapes"?engine.derive("shapes",values).shape:"";
    }

    function recordShape() {
        if(scene==="shapes"&&shapeModule==="sections")shapeHistory.add(currentShape());
    }

    function canAdvanceCurrentStage() {
        if(currentStage>=2)return false;
        if(isPlaneFigures){
            if(currentStage===0){
                if(planeModule==="circles"&&difficultyId==="challenge")return changedKeys.has("radius")&&changedKeys.has("sector");
                return changedKeys.size>=1;
            }
            if(planeModule==="lines")return planeHistory.size>=3||(difficultyId==="challenge"&&planePoint===50);
            if(planeModule==="angles")return planeHistory.size>=3||(difficultyId==="challenge"&&planeAngle===90);
            if(planeModule==="polygons")return planeHistory.size>=3||(difficultyId==="challenge"&&planeSides===8);
            return planeHistory.size>=3||(difficultyId==="challenge"&&planeSector===90);
        }
        if(scene!=="shapes")return changedKeys.size>=(currentStage===0?1:2);
        if(shapeModule==="solids"){
            const target={basic:3,advanced:4,challenge:5}[difficultyId];
            return currentStage===0?changedKeys.has("solid")||changedKeys.has("turn"):solidHistory.size>=target;
        }
        if(shapeModule==="nets"){
            const target={basic:80,advanced:95,challenge:100}[difficultyId];
            return currentStage===0?changedKeys.has("fold"):changedKeys.has("fold")&&shapeFold>=target;
        }
        if(shapeModule==="views")return currentStage===0?changedKeys.has("view")||changedKeys.has("solid"):viewHistory.size>=({basic:2,advanced:3,challenge:3}[difficultyId]);
        if(difficultyId==="basic")return currentStage===0?changedKeys.has("turn"):changedKeys.has("slice");
        if(difficultyId==="advanced")return currentStage===0?changedKeys.has("turn"):changedKeys.has("slice")&&shapeHistory.has("六边形")&&shapeHistory.has("三角形");
        return currentStage===0?changedKeys.has("turn")&&changedKeys.has("slice"):currentShape()===(session.profile.requiredShape||"三角形");
    }

    function shapeCoachText() {
        if(shapeModule==="solids"){
            const target={basic:3,advanced:4,challenge:5}[difficultyId];
            if(currentStage===0)return changedKeys.size?"已经开始观察。继续切换模型，比较结构数据。":"先点击一种不同的立体图形，再按住模型任意拖动。";
            if(currentStage===1)return solidHistory.size>=target?`已观察 ${solidHistory.size} 种立体，可以进入判断。`:`已观察 ${solidHistory.size}/${target} 种立体，请继续选择。`;
            return "结合右上角的面、棱、顶点数据完成自检。";
        }
        if(shapeModule==="nets"){
            const target={basic:80,advanced:95,challenge:100}[difficultyId];
            if(currentStage===0)return changedKeys.has("fold")?"展开图已经开始折叠。观察每个面移动的方向。":"拖动“折叠进度”，先停在中间位置观察六个面。";
            if(currentStage===1)return shapeFold>=target?"折叠目标已经达到，可以进入判断。":`当前折叠 ${shapeFold}%，请继续调到至少 ${target}%。`;
            return "回想六个正方形怎样围成封闭的正方体。";
        }
        if(shapeModule==="views"){
            const target={basic:2,advanced:3,challenge:3}[difficultyId];
            if(currentStage===0)return changedKeys.size?"观察方向已经改变。注意立体轮廓怎样变成平面图形。":"先点击“主视图、俯视图或左视图”中的一个方向。";
            if(currentStage===1)return viewHistory.size>=target?"需要的观察方向已经收集完成。":`已查看 ${viewHistory.size}/${target} 个方向，请继续切换视图。`;
            return "综合主视图、俯视图和左视图的轮廓完成判断。";
        }
        const shape=currentShape();
        if(difficultyId==="basic"){
            if(currentStage===0)return changedKeys.has("turn")?"很好，你已经换了观察角度。点击“完成本步”，下一步移动切面。":"第一步：把鼠标放在模型上，按住并向任意方向拖动。";
            if(currentStage===1)return changedKeys.has("slice")?`现在看到${shape}。请数一数粉色截面有几个发光交点。`:"第二步：拖动“截面位置”滑块，观察粉色切面和发光交点。";
            return Number(values.slice)===50?"位置已回到 50。直接根据画面中的发光交点作答。":"请先把截面位置调回 50，再完成下方自检。";
        }
        if(difficultyId==="advanced"){
            if(currentStage===0)return changedKeys.has("turn")?"中心截面确认完成：六边形，共 6 个交点。进入下一步做对比。":"先拖动模型，确认中心截面的 6 个交点分别落在哪些棱上。";
            if(currentStage===1){
                if(shapeHistory.has("六边形")&&shapeHistory.has("三角形"))return "对比完成：你已经同时观察到六边形和三角形，可以总结规律。";
                return `当前是${shape}。继续把切面移向更靠近顶点的位置，找到另一种形状。`;
            }
            return "回想两次观察：截面每增加一个交点，也会增加一条边。";
        }
        if(currentStage===0){
            const missing=[];if(!changedKeys.has("turn"))missing.push("拖动视角");if(!changedKeys.has("slice"))missing.push("移动切面");
            return missing.length?`闯关准备：还需要${missing.join("和")}。`:"两种操作都已掌握。进入下一步，独立做出三角形截面。";
        }
        if(currentStage===1)return shape==="三角形"?"目标达成：三角形 · 3 个交点。现在可以进入解释环节。":`当前是${shape}。继续移动切面，直到读数显示“三角形 · 3 个交点”。`;
        return shape==="三角形"?"保持当前三角形截面，根据 3 个发光交点完成自检。":"目标截面已改变。请重新做出三角形后再回答。";
    }

    function planeCoachText() {
        if(planeModule==="lines"){
            if(currentStage===0)return changedKeys.size?"已经切换线的类型。注意端点和箭头分别有几个。":"先点击线段、射线或直线中的一种。";
            if(currentStage===1)return difficultyId==="challenge"&&planePoint!==50?`当前分点在 ${planePoint}%，继续调到 50% 找到中点。`:`已观察 ${Math.max(1,planeHistory.size-1)} 种状态，继续比较端点与延伸方向。`;
            return "判断时只抓住两个特征：端点数量，以及能向几个方向延伸。";
        }
        if(planeModule==="angles"){
            const kind=planeAngle<90?"锐角":planeAngle===90?"直角":planeAngle<180?"钝角":"平角";
            if(currentStage===0)return changedKeys.size?`当前是 ${planeAngle}° ${kind}，继续拖动跨过 90°。`:"拖动角度滑块，观察活动射线和角弧同步转动。";
            if(currentStage===1)return difficultyId==="challenge"&&planeAngle!==90?`当前 ${planeAngle}°，请准确做出 90°。`:`你已经观察了 ${planeHistory.size} 种角度状态，可以进入判断。`;
            return "把当前角度与 90°、180° 两条分类边界比较。";
        }
        if(planeModule==="polygons"){
            if(currentStage===0)return changedKeys.size?`当前是 ${planeSides} 边形，共 ${planeSides} 个顶点。`:"拖动边数滑块，从三角形开始观察。";
            if(currentStage===1)return difficultyId==="challenge"&&planeSides!==8?`当前 ${planeSides} 条边，请继续调到 8。`:`已比较 ${planeHistory.size} 种边数，注意边数始终等于顶点数。`;
            return "多边形有几条边，就有几个顶点；一个顶点可连 n-3 条对角线。";
        }
        if(currentStage===0)return changedKeys.size?`半径 ${planeRadius}，圆心角 ${planeSector}°。观察圆和扇形怎样变化。`:"先改变半径或圆心角，观察图形同步变化。";
        if(currentStage===1)return difficultyId==="challenge"&&planeSector!==90?`当前圆心角 ${planeSector}°，请调到 90°。`:`已记录 ${planeHistory.size} 种圆与扇形状态，可以进入判断。`;
        return "扇形占整圆的比例等于圆心角除以 360°。";
    }

    function updateAdvanceState() {
        el.advanceButton.disabled=!canAdvanceCurrentStage();
    }

    function markShapeOrbitInteraction() {
        changedKeys.add("turn");
        recordShape();
        updateAdvanceState();
        el.coachText.textContent=shapeCoachText();
    }

    function disposeThreeObject(object) {
        object.traverse((child) => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                const materials=Array.isArray(child.material)?child.material:[child.material];
                materials.forEach((material)=>material.dispose());
            }
        });
    }

    function setupShapeWebGL() {
        if(scene!=="shapes"||!window.THREE||!window.THREE.OrbitControls)return false;
        const THREE=window.THREE;
        el.canvas.style.display="none";
        el.shapeCanvas.style.display="block";

        const renderer=new THREE.WebGLRenderer({canvas:el.shapeCanvas,antialias:true,alpha:false});
        renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
        renderer.setClearColor(0xf9fbff,1);
        renderer.shadowMap.enabled=true;
        renderer.shadowMap.type=THREE.PCFSoftShadowMap;
        // 统一压住模型受光面的高亮，避免高饱和颜色在浅色背景上出现过曝。
        if(THREE.ACESFilmicToneMapping){renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.82;}
        if(THREE.sRGBEncoding)renderer.outputEncoding=THREE.sRGBEncoding;

        const threeScene=new THREE.Scene();
        threeScene.background=new THREE.Color(0xf3f7fc);
        threeScene.fog=new THREE.Fog(0xf3f7fc,9,16);
        const camera=new THREE.PerspectiveCamera(38,1,.1,50);
        camera.position.set(4.7,3.6,5.8);
        const controls=new THREE.OrbitControls(camera,el.shapeCanvas);
        controls.enableDamping=true;
        controls.dampingFactor=.075;
        controls.enablePan=false;
        controls.minDistance=4.2;
        controls.maxDistance=10;
        controls.minPolarAngle=.12;
        controls.maxPolarAngle=Math.PI-.12;
        controls.target.set(0,0,0);

        threeScene.add(new THREE.HemisphereLight(0xffffff,0x8fa2b8,.48));
        const keyLight=new THREE.DirectionalLight(0xffffff,.68);keyLight.position.set(5,7,6);keyLight.castShadow=true;threeScene.add(keyLight);
        const colorLight=new THREE.PointLight(0xff4f88,.14,12);colorLight.position.set(-4,2,3);threeScene.add(colorLight);
        const fillLight=new THREE.PointLight(0x2477ff,.13,12);fillLight.position.set(3,-1,-4);threeScene.add(fillLight);

        const root=new THREE.Group();threeScene.add(root);
        const sectionModel=new THREE.Group();root.add(sectionModel);
        const solidRoot=new THREE.Group();root.add(solidRoot);
        const netRoot=new THREE.Group();root.add(netRoot);
        const faceColors=[0x0067d9,0x5b2ccf,0xd91f5c,0x00856a,0xd99100,0x007fbf];
        const materials=faceColors.map(color=>new THREE.MeshPhysicalMaterial({color,transparent:true,opacity:.5,roughness:.42,metalness:.02,side:THREE.DoubleSide,depthWrite:false}));
        const cubeMesh=new THREE.Mesh(new THREE.BoxGeometry(2.5,2.5,2.5),materials);cubeMesh.castShadow=true;sectionModel.add(cubeMesh);
        const cubeEdges=new THREE.LineSegments(new THREE.EdgesGeometry(cubeMesh.geometry),new THREE.LineBasicMaterial({color:0x18344f,transparent:true,opacity:1}));cubeEdges.renderOrder=3;sectionModel.add(cubeEdges);

        const planeMaterial=new THREE.MeshPhysicalMaterial({color:0xc98200,transparent:true,opacity:.29,side:THREE.DoubleSide,depthWrite:false,roughness:.48});
        const planeMesh=new THREE.Mesh(new THREE.PlaneGeometry(4.7,4.7),planeMaterial);planeMesh.renderOrder=4;sectionModel.add(planeMesh);
        const normal=new THREE.Vector3(1,1,1).normalize();
        planeMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),normal);

        const sectionRoot=new THREE.Group();sectionRoot.renderOrder=8;sectionModel.add(sectionRoot);

        const netFaces=[];
        const netSpecs=[
            {start:[0,0,0],target:[0,0,1.15],rotation:[0,0,0]},
            {start:[2.25,0,0],target:[1.15,0,0],rotation:[0,Math.PI/2,0]},
            {start:[-2.25,0,0],target:[-1.15,0,0],rotation:[0,-Math.PI/2,0]},
            {start:[0,2.25,0],target:[0,1.15,0],rotation:[-Math.PI/2,0,0]},
            {start:[0,-2.25,0],target:[0,-1.15,0],rotation:[Math.PI/2,0,0]},
            {start:[0,-4.5,0],target:[0,0,-1.15],rotation:[0,Math.PI,0]}
        ];
        netSpecs.forEach((spec,index)=>{
            const geometry=new THREE.PlaneGeometry(2.2,2.2);
            const material=new THREE.MeshStandardMaterial({color:faceColors[index],side:THREE.DoubleSide,roughness:.52,metalness:.01});
            const face=new THREE.Mesh(geometry,material);
            const outline=new THREE.LineSegments(new THREE.EdgesGeometry(geometry),new THREE.LineBasicMaterial({color:0x18344f}));face.add(outline);
            face.userData.startPosition=new THREE.Vector3(...spec.start);face.userData.targetPosition=new THREE.Vector3(...spec.target);
            face.userData.startQuaternion=new THREE.Quaternion();face.userData.targetQuaternion=new THREE.Quaternion().setFromEuler(new THREE.Euler(...spec.rotation));
            face.position.copy(face.userData.startPosition);netRoot.add(face);netFaces.push(face);
        });
        const grid=new THREE.GridHelper(11,22,0xb7c7d9,0xdfe7f0);grid.position.y=-1.72;threeScene.add(grid);
        const ground=new THREE.Mesh(new THREE.CircleGeometry(3.1,64),new THREE.ShadowMaterial({color:0x29415d,opacity:.13}));ground.rotation.x=-Math.PI/2;ground.position.y=-1.69;ground.receiveShadow=true;threeScene.add(ground);

        const resize=()=>{
            const rect=el.shapeCanvas.getBoundingClientRect();
            if(!rect.width||!rect.height)return;
            renderer.setSize(rect.width,rect.height,false);
            camera.aspect=rect.width/rect.height;
            camera.updateProjectionMatrix();
        };
        controls.addEventListener("start",markShapeOrbitInteraction);
        const animate=()=>{shape3d.frame=requestAnimationFrame(animate);controls.update();renderer.render(threeScene,camera);};
        shape3d={THREE,renderer,scene:threeScene,camera,controls,root,sectionModel,solidRoot,netRoot,netFaces,planeMesh,normal,sectionRoot,grid,ground,resize,frame:0,currentSolid:""};
        resize();
        animate();
        window.addEventListener("beforeunload",()=>{cancelAnimationFrame(shape3d.frame);controls.dispose();renderer.dispose();disposeThreeObject(threeScene);},{once:true});
        return true;
    }

    function clearThreeGroup(group) {
        while(group.children.length){const child=group.children[0];group.remove(child);disposeThreeObject(child);}
    }

    function createSolidGeometry(THREE,type) {
        if(type==="cuboid")return new THREE.BoxGeometry(3.2,1.8,2.2);
        if(type==="prism")return new THREE.CylinderGeometry(1.45,1.45,2.7,3);
        if(type==="pyramid")return new THREE.ConeGeometry(1.55,2.8,4);
        if(type==="cylinder")return new THREE.CylinderGeometry(1.25,1.25,2.7,48);
        if(type==="cone")return new THREE.ConeGeometry(1.5,2.9,48);
        if(type==="sphere")return new THREE.SphereGeometry(1.5,48,32);
        return new THREE.BoxGeometry(2.5,2.5,2.5);
    }

    function updateSolidModel() {
        if(!shape3d||shape3d.currentSolid===shapeSolid)return;
        const {THREE,solidRoot}=shape3d,solid=solidCatalog[shapeSolid];clearThreeGroup(solidRoot);
        const geometry=createSolidGeometry(THREE,solid.geometry);
        const colors={cube:0x0067d9,cuboid:0x4338ca,prism:0x00856a,pyramid:0xd91f5c,cylinder:0xd99100,cone:0xe34f24,sphere:0x6025c0};
        const material=new THREE.MeshStandardMaterial({color:colors[shapeSolid],roughness:.38,metalness:.03,side:THREE.DoubleSide});
        const mesh=new THREE.Mesh(geometry,material);mesh.castShadow=true;solidRoot.add(mesh);
        const edgeGeometry=shapeSolid==="sphere"?new THREE.WireframeGeometry(geometry):new THREE.EdgesGeometry(geometry,18);
        const edges=new THREE.LineSegments(edgeGeometry,new THREE.LineBasicMaterial({color:0x17324d,transparent:true,opacity:shapeSolid==="sphere"?.3:.92}));solidRoot.add(edges);
        shape3d.currentSolid=shapeSolid;
    }

    function updateNetModel() {
        if(!shape3d)return;
        const progress=Math.max(0,Math.min(1,shapeFold/100));
        shape3d.netFaces.forEach(face=>{
            face.position.copy(face.userData.startPosition).lerp(face.userData.targetPosition,progress);
            face.quaternion.copy(face.userData.startQuaternion).slerp(face.userData.targetQuaternion,progress);
        });
        const scale=.72+.28*progress;shape3d.netRoot.scale.setScalar(scale);shape3d.netRoot.position.y=.6*(1-progress);
    }

    function setShapeView(mode) {
        if(!shape3d)return;
        const {camera,controls}=shape3d;shapeViewMode=mode;
        const positions={"主视图":[0,0,7],"俯视图":[0,7,.001],"左视图":[-7,0,0],"立体观察":[4.7,3.6,5.8]};
        const position=positions[mode]||positions["立体观察"];camera.position.set(...position);camera.up.set(0,mode==="俯视图"?0:1,mode==="俯视图"?-1:0);controls.target.set(0,0,0);controls.enableRotate=mode==="立体观察";controls.update();
        if(mode!=="立体观察")viewHistory.add(mode);
    }

    function updateShapeWebGL() {
        if(!shape3d)return;
        const {THREE,root,sectionModel,solidRoot,netRoot,planeMesh,normal,sectionRoot,grid,ground}=shape3d,data=engine.derive("shapes",values);
        sectionModel.visible=shapeModule==="sections";solidRoot.visible=shapeModule==="solids"||shapeModule==="views";netRoot.visible=shapeModule==="nets";
        const fixedView=shapeModule==="views"&&shapeViewMode!=="立体观察";grid.visible=!fixedView;ground.visible=!fixedView;
        root.rotation.y=fixedView?0:Number(values.turn)*Math.PI/180;
        if(solidRoot.visible)updateSolidModel();
        if(netRoot.visible)updateNetModel();
        if(shapeModule!=="sections"){shape3d.resize();return;}
        // 引擎使用边长为 2 的标准立方体，三维场景边长为 2.5，切面位移必须同比缩放。
        planeMesh.position.copy(normal).multiplyScalar(data.planeValue/Math.sqrt(3)*1.25);
        while(sectionRoot.children.length){const child=sectionRoot.children[0];sectionRoot.remove(child);disposeThreeObject(child);}
        const points=data.vertices.map(point=>new THREE.Vector3(point[0]*1.25,point[1]*1.25,point[2]*1.25));
        if(points.length>=3){
            const positions=[];points.forEach(point=>positions.push(point.x,point.y,point.z));
            const geometry=new THREE.BufferGeometry();geometry.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
            const indices=[];for(let index=1;index<points.length-1;index++)indices.push(0,index,index+1);geometry.setIndex(indices);geometry.computeVertexNormals();
            const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0xd91f5c,transparent:true,opacity:.76,side:THREE.DoubleSide,depthTest:false}));mesh.renderOrder=9;sectionRoot.add(mesh);
            const loopGeometry=new THREE.BufferGeometry().setFromPoints([...points,points[0]]);
            const outline=new THREE.Line(loopGeometry,new THREE.LineBasicMaterial({color:0xff155f,transparent:true,opacity:1,depthTest:false}));outline.renderOrder=10;sectionRoot.add(outline);
            points.forEach(point=>{const marker=new THREE.Mesh(new THREE.SphereGeometry(.075,20,20),new THREE.MeshBasicMaterial({color:0xffffff,depthTest:false}));marker.position.copy(point);marker.renderOrder=11;sectionRoot.add(marker);});
        }
        shape3d.resize();
    }
    function drawBackdrop(w,h) {
        ctx.clearRect(0,0,w,h);
        const gradient=ctx.createLinearGradient(0,0,w,h); gradient.addColorStop(0,"#f9fcff"); gradient.addColorStop(.55,"#fff7fb"); gradient.addColorStop(1,"#fffdf4"); ctx.fillStyle=gradient; ctx.fillRect(0,0,w,h);
        ctx.fillStyle="rgba(49,133,255,.08)";
        for(let x=28;x<w;x+=42) for(let y=28;y<h;y+=42) circle(x,y,1.5,"rgba(49,133,255,.12)");
    }
    function drawAxes(w,h) {
        const compact=w<520,ox=w*.5,oy=h*.54,step=Math.min(w/22,42);
        line(65,oy,w-55,oy,"#91a4b8",2); line(ox,42,ox,h-42,"#91a4b8",2); arrow(w-70,oy,w-52,oy,"#91a4b8",2); arrow(ox,56,ox,40,"#91a4b8",2);
        for(let i=-9;i<=9;i++){const x=ox+i*step;if(x>65&&x<w-55){line(x,oy-5,x,oy+5,"#91a4b8",1);if(i!==0&&(!compact||i%2===0))text(i,x,oy+20,11,palette.muted);}}
        for(let i=-5;i<=5;i++){const y=oy-i*step;if(y>42&&y<h-42){line(ox-5,y,ox+5,y,"#91a4b8",1);}}
        return {ox,oy,step};
    }
    function drawNumberline(w,h) {
        const compact=w<520,d=engine.derive("numberline",values),left=compact?28:75,right=w-left,y=h*.56;
        const domainMin=Math.floor(Math.min(-10,d.start,d.end)/5)*5,domainMax=Math.ceil(Math.max(10,d.start,d.end)/5)*5,span=domainMax-domainMin,step=(right-left)/span;
        const minimumLabelInterval=(compact?18:28)/step,labelStep=[1,2,5,10].find(interval=>interval>=minimumLabelInterval)||10;
        arrow(left,y,right,y,palette.ink,4); for(let i=domainMin;i<=domainMax;i++){const x=left+(i-domainMin)*step;line(x,y-8,x,y+8,"#61758a",2);if(i%labelStep===0)text(i,x,y+28,compact?11:12,palette.muted);}
        const sx=left+(d.start-domainMin)*step,ex=left+(d.end-domainMin)*step;
        circle(sx,y,13,palette.blue,"#fff",4); circle(ex,y,15,palette.pink,"#fff",4); arrow(sx,y-62,ex,y-62,palette.purple,6);
        text(`从 ${d.start} ${d.move>=0?"向右":"向左"}移动 ${Math.abs(d.move)} 格`,w/2,compact?54:74,compact?17:22,palette.purple); text(`终点 ${d.end}`,Math.max(compact?38:48,Math.min(w-(compact?38:48),ex)),y-28,compact?14:17,palette.pink);
    }
    function drawAlgebra(w,h) {
        const compact=w<520,xVal=values.x,constant=values.constant;
        if(compact){
            const margin=18,gap=8,brickWidth=(w-margin*2-gap*2)/3,brickTop=72,tileWidth=Math.min(46,(w-margin*2-gap*3)/4),tileStart=(w-(tileWidth*4+gap*3))/2,tileTop=142;
            text("代数砖：x 长砖 · 常数小块",w/2,38,16,palette.purple);
            for(let i=0;i<3;i++){const x=margin+i*(brickWidth+gap);roundRect(x,brickTop,brickWidth,48,7,"#7c4dff","#fff",3);text("x",x+brickWidth/2,brickTop+24,21,"#fff");}
            const count=Math.min(8,Math.abs(constant));for(let i=0;i<count;i++){const x=tileStart+(i%4)*(tileWidth+gap),y=tileTop+Math.floor(i/4)*50;roundRect(x,y,tileWidth,42,7,constant>=0?"#ff5b8f":"#3185ff","#fff",3);text(constant>=0?"+1":"-1",x+tileWidth/2,y+21,14,"#fff");}
            roundRect(margin,250,w-margin*2,92,10,"#fff","#bfd6f3",2);text("代入检验",w/2,270,15,palette.blue);text(`x = ${xVal}`,w/2,298,20,palette.purple);text(`3x ${constant>=0?"+":"-"} ${Math.abs(constant)} = ${3*xVal+constant}`,w/2,323,20,palette.pink);return;
        }
        const baseX=w*.18,top=h*.24;
        text("代数砖：长砖代表 x，小方块代表常数",w/2,54,20,palette.purple);
        for(let i=0;i<3;i++){roundRect(baseX+i*128,top,105,58,8,"#7c4dff","#fff",3);text("x",baseX+i*128+52,top+29,25,"#fff");}
        const count=Math.min(8,Math.abs(constant)); for(let i=0;i<count;i++){const x=baseX+(i%4)*72,y=top+105+Math.floor(i/4)*70;roundRect(x,y,56,50,7,constant>=0?"#ff5b8f":"#3185ff","#fff",3);text(constant>=0?"+1":"-1",x+28,y+25,16,"#fff");}
        roundRect(w*.62,h*.2,w*.28,h*.48,12,"#fff","#bfd6f3",2); text("代入检验",w*.76,h*.27,18,palette.blue); text(`x = ${xVal}`,w*.76,h*.4,30,palette.purple); text(`3x ${constant>=0?"+":"-"} ${Math.abs(constant)}`,w*.76,h*.52,25,palette.ink); text(`= ${3*xVal+constant}`,w*.76,h*.64,34,palette.pink);
    }
    function drawPlaneFigures(w,h) {
        const compact=w<620;
        if(planeModule==="lines"){
            const labels={segment:"线段",ray:"射线",line:"直线"},left=compact?48:w*.15,right=compact?w-48:w*.76,y=h*.5,color=planeLineType==="segment"?palette.blue:planeLineType==="ray"?palette.pink:palette.purple;
            ctx.save();ctx.shadowColor="rgba(49,133,255,.2)";ctx.shadowBlur=18;
            if(planeLineType==="segment")line(left,y,right,y,color,9);
            else if(planeLineType==="ray")arrow(left,y,right,y,color,9);
            else{arrow((left+right)/2,y,right,y,color,9);arrow((left+right)/2,y,left,y,color,9);}
            ctx.restore();
            if(planeLineType!=="line")circle(left,y,12,palette.yellow,"#fff",4);
            if(planeLineType==="segment")circle(right,y,12,palette.mint,"#fff",4);
            const pointX=left+(right-left)*planePoint/100;circle(pointX,y,10,"#fff",color,4);text("P",pointX,y-29,16,color);
            text(difficultyId==="challenge"?"观察端点与箭头":labels[planeLineType],w*.5,h*.18,compact?24:36,color);
            const feature=planeLineType==="segment"?"2 个端点 · 不向外延伸":planeLineType==="ray"?"1 个端点 · 向一侧无限延伸":"0 个端点 · 向两侧无限延伸";
            roundRect(compact?28:w*.63,h*.7,compact?w-56:w*.29,62,8,"rgba(255,255,255,.94)","#c9d9ec",2);text(difficultyId==="challenge"?"请根据图示自行判断":feature,compact?w/2:w*.775,h*.76,compact?14:17,palette.ink);
            if(planeLineType==="segment"){text(`左段 ${planePoint}%`,left+(pointX-left)/2,y+36,13,palette.blue);text(`右段 ${100-planePoint}%`,pointX+(right-pointX)/2,y+36,13,palette.mint);}
            return;
        }
        if(planeModule==="angles"){
            const cx=compact?w*.38:w*.35,cy=h*.7,r=Math.min(compact?w*.32:w*.34,h*.42),rad=-planeAngle*Math.PI/180,kind=planeAngle<90?"锐角":planeAngle===90?"直角":planeAngle<180?"钝角":"平角";
            ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r*.58,rad,0);ctx.closePath();const wedge=ctx.createRadialGradient(cx,cy,5,cx,cy,r*.6);wedge.addColorStop(0,"rgba(124,77,255,.32)");wedge.addColorStop(1,"rgba(255,91,143,.12)");ctx.fillStyle=wedge;ctx.fill();
            line(cx,cy,cx+r,cy,palette.blue,9);line(cx,cy,cx+r*Math.cos(rad),cy+r*Math.sin(rad),palette.pink,9);circle(cx,cy,13,palette.yellow,"#fff",4);
            ctx.beginPath();ctx.arc(cx,cy,r*.36,rad,0);ctx.strokeStyle=palette.purple;ctx.lineWidth=6;ctx.stroke();
            if(planeAngle!==90){ctx.beginPath();ctx.arc(cx,cy,r*.72,-Math.PI/2,0);ctx.strokeStyle="rgba(49,133,255,.28)";ctx.lineWidth=2;ctx.setLineDash([7,7]);ctx.stroke();ctx.setLineDash([]);}
            text(`${planeAngle}°`,cx+r*.45*Math.cos(rad/2),cy+r*.45*Math.sin(rad/2),compact?21:27,palette.purple);
            const cardX=compact?w*.68:w*.72,cardW=compact?w*.28:w*.22;roundRect(cardX-cardW/2,h*.25,cardW,120,10,"rgba(255,255,255,.95)","#ffbdd1",2);text(difficultyId==="challenge"?"自行判断":kind,cardX,h*.34,compact?22:34,palette.pink);text(difficultyId==="challenge"?"与分类边界比较":planeAngle===90?"两边互相垂直":planeAngle===180?"两边方向相反":"与 90°、180° 比较",cardX,h*.46,compact?11:14,palette.muted);
            return;
        }
        if(planeModule==="polygons"){
            const cx=compact?w/2:w*.4,cy=compact?h*.3:h*.53,r=compact?Math.min(w*.25,h*.22):Math.min(w,h)*.32,points=[];
            for(let index=0;index<planeSides;index++){const angle=-Math.PI/2+index*Math.PI*2/planeSides;points.push([cx+Math.cos(angle)*r,cy+Math.sin(angle)*r]);}
            const gradient=ctx.createLinearGradient(cx-r,cy-r,cx+r,cy+r);gradient.addColorStop(0,"rgba(49,133,255,.42)");gradient.addColorStop(.5,"rgba(124,77,255,.3)");gradient.addColorStop(1,"rgba(255,91,143,.38)");
            ctx.beginPath();points.forEach((point,index)=>index?ctx.lineTo(point[0],point[1]):ctx.moveTo(point[0],point[1]));ctx.closePath();ctx.fillStyle=gradient;ctx.fill();ctx.strokeStyle=palette.purple;ctx.lineWidth=7;ctx.lineJoin="round";ctx.stroke();
            if(difficultyId!=="basic")for(let index=2;index<planeSides-1;index++)line(points[0][0],points[0][1],points[index][0],points[index][1],"rgba(255,255,255,.8)",3,[7,6]);
            points.forEach((point,index)=>{circle(point[0],point[1],8,index%2?palette.pink:palette.yellow,"#fff",3);if(!compact)text(index+1,point[0],point[1]-20,12,palette.muted);});
            const names={3:"三角形",4:"四边形",5:"五边形",6:"六边形",7:"七边形",8:"八边形"};
            if(compact){const cardY=h-132;roundRect(12,cardY,w-24,118,10,"rgba(255,255,255,.95)","#c8b8ff",2);text(difficultyId==="challenge"?"待判断图形":names[planeSides],w/2,cardY+24,19,palette.purple);text(`${planeSides} 条边`,w/2,cardY+50,15,palette.blue);text(`${planeSides} 个顶点`,w/2,cardY+74,15,palette.pink);text(difficultyId==="challenge"?"请自行计算对角线":`一个顶点可连 ${Math.max(0,planeSides-3)} 条对角线`,w/2,cardY+99,11,palette.muted);}
            else{const cardX=w*.78;roundRect(cardX-105,h*.23,210,158,10,"rgba(255,255,255,.95)","#c8b8ff",2);text(difficultyId==="challenge"?"待判断图形":names[planeSides],cardX,h*.31,31,palette.purple);text(`${planeSides} 条边`,cardX,h*.41,16,palette.blue);text(`${planeSides} 个顶点`,cardX,h*.49,16,palette.pink);text(difficultyId==="challenge"?"请自行计算对角线":`一个顶点可连 ${Math.max(0,planeSides-3)} 条对角线`,cardX,h*.57,14,palette.muted);}
            return;
        }
        const cx=compact?w/2:w*.38,cy=compact?h*.32:h*.53,r=compact?Math.min(w,h)*(.13+planeRadius*.017):Math.min(w,h)*(.18+planeRadius*.018),start=-Math.PI/2,end=start+planeSector*Math.PI/180;
        ctx.beginPath();ctx.moveTo(cx,cy);ctx.arc(cx,cy,r,start,end);ctx.closePath();const sectorGradient=ctx.createRadialGradient(cx,cy,4,cx,cy,r);sectorGradient.addColorStop(0,"rgba(255,189,46,.78)");sectorGradient.addColorStop(1,"rgba(255,91,143,.5)");ctx.fillStyle=sectorGradient;ctx.fill();
        circle(cx,cy,r,"rgba(49,133,255,.08)",palette.blue,7);line(cx,cy,cx+r*Math.cos(start),cy+r*Math.sin(start),palette.purple,5);line(cx,cy,cx+r*Math.cos(end),cy+r*Math.sin(end),palette.pink,5);circle(cx,cy,11,palette.yellow,"#fff",4);text("O",cx,cy+30,15,palette.ink);
        const arcMid=start+(end-start)/2;text(`${planeSector}°`,compact?cx:cx+Math.cos(arcMid)*r*.48,compact?24:cy+Math.sin(arcMid)*r*.48,compact?17:23,palette.purple);
        if(compact){const cardY=h-130;roundRect(12,cardY,w-24,116,10,"rgba(255,255,255,.95)","#ffd291",2);text("圆与扇形",w/2,cardY+23,19,"#b56f00");text(`半径 r = ${planeRadius}`,w/2,cardY+48,15,palette.blue);text(`圆心角 ${planeSector}°`,w/2,cardY+72,15,palette.pink);text(difficultyId==="challenge"?"请自行计算所占比例":`占整圆 ${(planeSector/360*100).toFixed(1)}%`,w/2,cardY+96,11,palette.muted);}
        else{const cardX=w*.78;roundRect(cardX-110,h*.25,220,150,10,"rgba(255,255,255,.95)","#ffd291",2);text("圆与扇形",cardX,h*.32,28,"#b56f00");text(`半径 r = ${planeRadius}`,cardX,h*.42,16,palette.blue);text(`圆心角 ${planeSector}°`,cardX,h*.5,16,palette.pink);text(difficultyId==="challenge"?"请自行计算所占比例":`占整圆 ${(planeSector/360*100).toFixed(1)}%`,cardX,h*.58,15,palette.muted);}
    }
    function drawAngle(w,h) {
        const angle=values.angle,cx=w*.36,cy=h*.72,r=Math.min(w,h)*.35,rad=-angle*Math.PI/180;
        line(cx,cy,cx+r,cy,palette.blue,8); line(cx,cy,cx+r*Math.cos(rad),cy+r*Math.sin(rad),palette.pink,8); circle(cx,cy,12,palette.yellow,"#fff",4);
        ctx.beginPath();ctx.arc(cx,cy,r*.34,rad,0);ctx.strokeStyle=palette.purple;ctx.lineWidth=5;ctx.stroke();
        const kind=angle<90?"锐角":angle===90?"直角":angle<180?"钝角":"平角"; text(`${angle}°`,cx+r*.23*Math.cos(rad/2),cy+r*.23*Math.sin(rad/2),23,palette.purple); roundRect(w*.68,h*.28,w*.22,112,12,"#fff","#ffd1df",2);text(kind,w*.79,h*.37,34,palette.pink);text("根据角的大小判断",w*.79,h*.49,14,palette.muted);
    }
    function drawChart(w,h) {
        const groups=Math.round(values.group),samples=values.samples,left=85,bottom=h-68,maxH=h*.55,barW=Math.min(68,(w-200)/groups*.58);
        text(`样本 ${samples} 人 · 分成 ${groups} 组`,w/2,48,20,palette.purple);
        line(left,bottom,w-65,bottom,palette.ink,3);line(left,bottom,left,90,palette.ink,3);
        for(let i=0;i<groups;i++){const ratio=.35+.55*Math.abs(Math.sin((i+1)*1.7+samples*.03)),height=maxH*ratio,x=left+40+i*(w-190)/groups;const colors=[palette.blue,palette.pink,palette.yellow,palette.mint,palette.purple];roundRect(x,bottom-height,barW,height,8,colors[i%colors.length]);text(`${Math.round(samples*ratio/groups)}`,x+barW/2,bottom-height-16,13,palette.muted);}
    }
    function drawArea(w,h) {
        const compact=w<520,a=values.a,b=values.b,x=compact?36:w*.12,y=compact?58:h*.17,rw=compact?w-72:w*.55,rh=compact?h*.58:h*.62,splitX=x+rw*.62,splitY=y+rh*.62;
        roundRect(x,y,rw,rh,8,"#fff","#7c4dff",4);
        ctx.fillStyle="rgba(49,133,255,.22)";ctx.fillRect(x,y,splitX-x,splitY-y);
        ctx.fillStyle="rgba(255,91,143,.22)";ctx.fillRect(splitX,y,x+rw-splitX,splitY-y);
        ctx.fillStyle="rgba(32,201,151,.22)";ctx.fillRect(x,splitY,splitX-x,y+rh-splitY);
        ctx.fillStyle="rgba(255,189,46,.3)";ctx.fillRect(splitX,splitY,x+rw-splitX,y+rh-splitY);
        line(splitX,y,splitX,y+rh,palette.purple,3);line(x,splitY,x+rw,splitY,palette.purple,3);
        text("x²",x+(splitX-x)/2,y+(splitY-y)/2,compact?24:31,palette.blue);
        text(`${a}x`,splitX+(x+rw-splitX)/2,y+(splitY-y)/2,compact?20:26,palette.pink);
        text(`${b}x`,x+(splitX-x)/2,splitY+(y+rh-splitY)/2,compact?20:26,palette.mint);
        text(String(a*b),splitX+(x+rw-splitX)/2,splitY+(y+rh-splitY)/2,compact?20:27,"#986a00");
        const formula=`(x+${a})(x+${b}) = x²+${a+b}x+${a*b}`;
        if(compact)text(formula,w/2,h-32,16,palette.purple);
        else{roundRect(w*.7,h*.25,w*.25,h*.34,12,"#fff","#ffd1df",2);text("四块面积相加",w*.825,h*.33,16,palette.muted);text(`x² + ${a}x + ${b}x + ${a*b}`,w*.825,h*.44,20,palette.blue);text(`= x² + ${a+b}x + ${a*b}`,w*.825,h*.54,22,palette.purple);}
    }
    function drawParallel(w,h) {
        const compact=w<520,a=values.angle*Math.PI/180,y1=h*.32,y2=h*.68,cx=w*values.offset/100,len=Math.max(w,h),margin=compact?28:90;
        line(margin,y1,w-margin,y1,palette.blue,7);line(margin,y2,w-margin,y2,palette.blue,7);line(cx-len*Math.cos(a),h/2+len*Math.sin(a),cx+len*Math.cos(a),h/2-len*Math.sin(a),palette.pink,7);
        circle(cx,y1,10,palette.yellow,"#fff",3);circle(cx,y2,10,palette.yellow,"#fff",3);
        text(`${values.angle}°`,compact?Math.min(w-36,Math.max(36,cx+42)):cx+65,y1-(compact?22:28),compact?15:20,palette.purple);
        text(`同位角 = ${values.angle}°`,compact?w/2:cx+75,compact?h*.84:y2-28,compact?15:20,palette.purple);
        text("两条平行线被同一条直线所截",w/2,compact?34:52,compact?15:20,palette.ink);
    }
    function drawProbability(w,h) {
        const d=engine.derive("probability",values),trials=Math.round(values.trials),chance=values.chance/100,bins=w<520?6:12,base=h-70,left=w<520?34:80,chartW=w-left*2,slot=chartW/bins,barWidth=Math.max(8,slot-12);
        text(`目标概率 ${values.chance}% · 模拟 ${trials} 次`,w/2,46,20,palette.purple);line(left,base,w-70,base,palette.ink,3);
        const theoretical=base-(h-150)*chance;line(left,theoretical,w-70,theoretical,palette.pink,3,[9,7]);text("理论概率",w-80,theoretical-15,13,palette.pink,"right");
        for(let i=0;i<bins;i++){const noise=Math.sin(i*4.13+trials)*Math.max(.02,.22/Math.sqrt(Math.max(1,trials/10))),freq=Math.max(0,Math.min(1,chance+noise)),bh=(h-150)*freq,x=left+i*slot+(slot-barWidth)/2;roundRect(x,base-bh,barWidth,bh,5,i===bins-1?palette.pink:palette.blue);}
        text(`预计约出现 ${d.expected} 次`,w/2,h-30,20,palette.ink);
    }
    function drawTriangle(w,h) {
        const compact=w<520,d=engine.derive("triangle",values),ax=w*(compact?.18:.22),ay=h*(compact?.65:.75),bx=w*(compact?.82:.68),by=ay,cx=w*(compact?.5:.45),cy=h*(compact?.16:.18);
        ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.lineTo(cx,cy);ctx.closePath();ctx.fillStyle="rgba(32,201,151,.18)";ctx.fill();ctx.strokeStyle=palette.mint;ctx.lineWidth=7;ctx.stroke();[ [ax,ay],[bx,by],[cx,cy] ].forEach(p=>circle(p[0],p[1],10,palette.pink,"#fff",3));
        text(`底 ${values.a}`,w*.5,ay+26,compact?14:16,palette.blue);text(`高 ${values.height}`,cx+(compact?38:62),(cy+ay)/2,compact?14:16,palette.purple);line(cx,cy,cx,ay,palette.purple,3,[7,6]);
        if(compact){text(`面积 ${d.area}`,w/2,h*.82,21,palette.pink);text("内角和始终为 180°",w/2,h*.92,15,palette.ink);}
        else{text(`面积 ${d.area}`,w*.81,h*.34,28,palette.pink);text("内角和始终为 180°",w*.78,h*.49,18,palette.ink);}
    }
    function drawSymmetry(w,h) {
        const axis=w*values.axis/100,maxOffset=session.controls.find(control=>control.key==="offset")?.max||7,unit=Math.max(0,Math.min(38,w/25,(axis-24)/maxOffset,(w-axis-24)/maxOffset)),offset=values.offset*unit,y=h*.46;
        line(axis,55,axis,h-55,palette.purple,4,[10,8]);text("对称轴",axis,34,15,palette.purple);
        circle(axis-offset,y,18,palette.blue,"#fff",4);circle(axis+offset,y,18,palette.pink,"#fff",4);text("A",axis-offset,y,15,"#fff");text("A′",axis+offset,y,15,"#fff");line(axis-offset,y,axis+offset,y,palette.yellow,5);line(axis,y-10,axis,y+10,palette.ink,3);text(`距离均为 ${values.offset}`,axis,h*.68,22,palette.ink);
    }
    function drawFunction(w,h) {
        const compact=w<520,variant=scene,derived=engine.derive(variant,values),axis=drawAxes(w,h),colors=[palette.blue,palette.pink];
        const drawLine=(k,b,color,width)=>{ctx.beginPath();for(let px=65;px<w-55;px+=3){const x=(px-axis.ox)/axis.step,y=k*x+b,py=axis.oy-y*axis.step;if(px===65)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.strokeStyle=color;ctx.lineWidth=width;ctx.stroke();};
        if(variant==="graph-review"){ctx.beginPath();for(let px=65;px<w-55;px+=3){const x=(px-axis.ox)/axis.step,y=values.a*Math.pow(x-values.b,2),py=axis.oy-y*axis.step/2;if(px===65)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.strokeStyle=palette.pink;ctx.lineWidth=5;ctx.stroke();if(compact){roundRect(12,12,w-24,42,8,"rgba(255,255,255,.94)","#cfe0f2",2);text(`y=${values.a}(x-${values.b})²`,w/2,33,16,palette.purple);}else{text(`y=${values.a}(x-${values.b})²`,w*.76,58,20,palette.purple);}return;}
        drawLine(derived.k,derived.b,colors[0],5); derived.points.forEach(p=>{const px=axis.ox+p.x*axis.step,py=axis.oy-p.y*axis.step;if(py>35&&py<h-35)circle(px,py,7,palette.pink,"#fff",2);});
        if(compact){const cardHeight=variant==="function-table"?118:44;roundRect(12,12,w-24,cardHeight,8,"rgba(255,255,255,.94)","#cfe0f2",2);text(derived.expression,w/2,32,16,palette.purple);if(variant==="function-table"){derived.points.forEach((p,i)=>text(`x=${p.x} → y=${p.y}`,w/2,52+i*16,11,i%2?palette.pink:palette.blue));}}
        else{roundRect(w*.67,40,w*.26,variant==="function-table"?190:80,10,"rgba(255,255,255,.94)","#cfe0f2",2);text(derived.expression,w*.8,80,24,palette.purple);if(variant==="function-table"){derived.points.forEach((p,i)=>text(`x=${p.x}  →  y=${p.y}`,w*.8,112+i*24,13,i%2?palette.pink:palette.blue));}}
    }
    function drawPythagorean(w,h) {
        const compact=w<520,d=engine.derive("pythagorean",values),compactMargin=14,compactTop=42,compactBottom=h-70;
        const scale=compact?Math.min(26,(w-compactMargin*2)/(values.a+values.b*2),(compactBottom-compactTop)/(values.a*2+values.b)):Math.min(42,175/Math.max(values.a,values.b));
        const ax=compact?compactMargin+values.b*scale:w*.25,ay=compact?compactTop+(values.a+values.b)*scale:h*.62,bx=ax+values.a*scale,by=ay,cx=ax,cy=ay-values.b*scale;
        const polygon=(points,fill,stroke)=>{ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=3;ctx.stroke();};
        const aSide=values.a*scale,bSide=values.b*scale,dx=bx-cx,dy=by-cy,cSide=Math.sqrt(dx*dx+dy*dy),nx=dy/cSide*cSide,ny=-dx/cSide*cSide;
        polygon([[ax,ay],[bx,by],[bx,by+aSide],[ax,ay+aSide]],"rgba(49,133,255,.24)",palette.blue);
        polygon([[ax,ay],[cx,cy],[cx-bSide,cy],[ax-bSide,ay]],"rgba(32,201,151,.24)",palette.mint);
        polygon([[cx,cy],[bx,by],[bx+nx,by+ny],[cx+nx,cy+ny]],"rgba(255,91,143,.2)",palette.pink);
        ctx.beginPath();ctx.moveTo(ax,ay);ctx.lineTo(bx,by);ctx.lineTo(cx,cy);ctx.closePath();ctx.fillStyle="#fff";ctx.fill();ctx.strokeStyle=palette.purple;ctx.lineWidth=5;ctx.stroke();roundRect(ax+7,ay-26,19,19,0,null,palette.ink,2);
        text(`a² = ${d.leftArea}`,(ax+bx)/2,ay+aSide*.52,compact?13:17,palette.blue);text(`b² = ${d.rightArea}`,ax-bSide*.5,(ay+cy)/2,compact?13:17,palette.mint);text(`c² = ${d.hypotenuseArea}`,(bx+cx+nx)/2,(by+cy+ny)/2,compact?13:17,palette.pink);
        if(compact){text(`${d.leftArea} + ${d.rightArea} = ${d.hypotenuseArea}`,w/2,h-36,22,palette.purple);}
        else{roundRect(w*.68,h*.2,w*.25,h*.5,12,"#fff","#ffd1df",2);text("两个小正方形",w*.805,h*.28,16,palette.muted);text(`${d.leftArea} + ${d.rightArea}`,w*.805,h*.39,30,palette.blue);text("=",w*.805,h*.49,22,palette.muted);text(`${d.hypotenuseArea}`,w*.805,h*.59,36,palette.pink);text("a² + b² = c²",w*.805,h*.7,18,palette.purple);}
    }
    function drawPath(w,h) {
        const compact=w<520,rw=compact?w-64:w*.62,rh=h*(compact?.48:.5),x=compact?32:w*.16,y=h*(compact?.21:.22);roundRect(x,y,rw,rh,6,"#fff","#3185ff",4);line(x+rw/2,y,x+rw/2,y+rh,palette.line,2,[6,6]);line(x,y+rh/2,x+rw,y+rh/2,palette.line,2,[6,6]);
        circle(x+28,y+rh-25,11,palette.pink,"#fff",3);circle(x+rw-30,y+28,11,palette.mint,"#fff",3);arrow(x+34,y+rh-31,x+rw-36,y+34,palette.purple,6);text(`展开宽 ${values.width}`,x+rw/2,y-25,compact?15:17,palette.blue);text(compact?`高 ${values.height}`:`展开高 ${values.height}`,compact?x+27:x-58,y+rh/2,compact?14:17,palette.pink);text(`最短距离 ≈ ${Math.sqrt(values.width**2+values.height**2).toFixed(2)}`,compact?w/2:w*.78,h*(compact?.86:.82),compact?16:19,palette.purple);
    }
    function drawReal(w,h) {
        const d=engine.derive("real",values),left=80,right=w-80,y=h*.6,span=10,step=(right-left)/span;arrow(left,y,right,y,palette.ink,4);for(let i=0;i<=span;i++){const x=left+i*step;line(x,y-9,x,y+9,palette.muted,2);text(i,x,y+28,12,palette.muted);}
        const x=left+Math.sqrt(values.radicand)*step;circle(x,y,16,palette.pink,"#fff",4);text(`√${values.radicand} ≈ ${d.value}`,x,y-38,21,palette.purple);text(`${d.lower} < √${values.radicand} < ${d.upper}`,w/2,70,24,palette.blue);
    }
    function drawCoordinate(w,h) {
        const compact=w<520,d=engine.derive("coordinate",values),a=drawAxes(w,h),x=a.ox+d.x*a.step,y=a.oy-d.y*a.step;line(x,a.oy,x,y,palette.blue,2,[6,5]);line(a.ox,y,x,y,palette.pink,2,[6,5]);circle(x,y,15,palette.purple,"#fff",4);text(`(${d.x}, ${d.y})`,x,y-(compact?25:29),compact?14:18,palette.purple);
        if(compact){roundRect(12,h-52,w-24,38,9,"rgba(255,255,255,.94)","#ffd1df",2);text(d.quadrant,w/2,h-33,16,palette.pink);}
        else{roundRect(w*.7,52,w*.22,72,10,"#fff","#ffd1df",2);text(d.quadrant,w*.81,88,22,palette.pink);}
    }
    function drawTransform(w,h) {
        const compact=w<520,d=engine.derive("transform",values),a=drawAxes(w,h),size=48,fromX=a.ox-size/2,fromY=a.oy-size/2,toX=a.ox+d.to.x*a.step-size/2,toY=a.oy-d.to.y*a.step-size/2;roundRect(fromX,fromY,size,size,6,"rgba(49,133,255,.35)",palette.blue,3);roundRect(toX,toY,size,size,6,"rgba(255,91,143,.35)",palette.pink,3);arrow(fromX+size/2,fromY+size/2,toX+size/2,toY+size/2,palette.yellow,5);text(d.rule,compact?w/2:w*.75,compact?24:55,compact?14:18,palette.purple);
    }
    function drawMeasurement(w,h) {
        const compact=w<520,d=engine.derive("measurement",values),left=compact?18:75,right=w-left,y=h*.56,length=right-left;roundRect(left,y-48,length,96,8,"#fff7dc","#ffbd2e",3);const divisions=Math.round(100/values.scale),majorInterval=Math.max(1,Math.round(10/values.scale)),majorSpacing=length/divisions*majorInterval,labelMultiplier=compact?Math.max(1,Math.ceil(30/majorSpacing)):1,labelInterval=majorInterval*labelMultiplier;for(let i=0;i<=divisions;i++){const x=left+i*length/divisions,major=i%majorInterval===0;line(x,y-48,x,y-48+(major?34:20),palette.ink,major?2:1);if(i%labelInterval===0)text(Math.round(i*values.scale),x,y+11,11,palette.muted);}
        const objectX=left+d.reading/100*length;line(objectX,y-92,objectX,y+55,palette.pink,5);arrow(compact?Math.max(left,objectX-55):objectX-65,y-76,objectX-5,y-76,palette.pink,4);text(`读数 ${d.reading} mm`,compact?Math.max(62,Math.min(w-62,objectX)):objectX,y-116,compact?18:22,palette.purple);text(`分度值 ${d.scale} mm，估读到 ${d.estimatedDigit} mm`,w/2,h-45,compact?15:18,palette.ink);
    }
    function drawMotion(w,h) {
        const d=engine.derive("motion",values),roadY=h*.7,left=70,right=w-70,progress=Math.min(1,d.distance/120);line(left,roadY,right,roadY,"#607d8b",10);for(let x=left;x<right;x+=70)line(x,roadY,x+35,roadY,"#fff",3);
        const carX=left+progress*(right-left);roundRect(carX-52,roadY-68,104,45,12,palette.blue);roundRect(carX-25,roadY-96,54,34,8,palette.pink);circle(carX-32,roadY-18,13,palette.ink);circle(carX+33,roadY-18,13,palette.ink);text(`${d.speed} m/s`,carX,roadY-46,14,"#fff");
        text(`s = vt = ${d.speed} × ${d.time} = ${d.distance} m`,w/2,65,26,palette.purple);line(left,h*.33,right,h*.33,palette.line,2);const gx=left+d.time/10*(right-left),gy=h*.33-d.distance/120*h*.22;line(left,h*.33,gx,gy,palette.pink,5);circle(gx,gy,8,palette.pink,"#fff",2);
    }
    function drawError(w,h) {
        const compact=w<520,d=engine.derive("error",values),measurements=[-1.2,.7,-.4,1.1,-.2].map(n=>values.trueValue+values.error+n),left=compact?18:w*.12,barW=compact?w-118:w*.65;
        text(`真实值 ${values.trueValue}`,w/2,compact?28:50,compact?17:21,palette.blue);measurements.forEach((m,i)=>{const y=(compact?58:115)+i*(compact?43:58),barHeight=compact?30:34;roundRect(left,y,barW,barHeight,7,"#eef5ff");roundRect(left,y,barW*Math.min(1,m/100),barHeight,7,i%2?palette.pink:palette.blue);text(`第${i+1}次 ${m.toFixed(1)}`,compact?w-10:left+barW+75,y+barHeight/2,compact?11:14,palette.muted,compact?"right":undefined);});
        if(compact){roundRect(18,286,w-36,58,10,"#fff","#ffd1df",2);text(`平均约 ${d.measuredValue}`,w/2,304,14,palette.purple);text(`相对误差 ${d.relativeError}%`,w/2,329,13,palette.pink);}
        else{roundRect(w*.69,h*.65,w*.24,92,10,"#fff","#ffd1df",2);text(`平均约 ${d.measuredValue}`,w*.81,h*.7,19,palette.purple);text(`相对误差 ${d.relativeError}%`,w*.81,h*.79,16,palette.pink);}
    }
    function drawWave(w,h) {
        const d=engine.derive(scene,values),mid=h*.52,left=65,right=w-65,amp=values.amplitude*18,freq=values.frequency;line(left,mid,right,mid,palette.line,2);ctx.beginPath();for(let x=left;x<=right;x+=2){const y=mid-Math.sin((x-left)/(right-left)*Math.PI*2*freq)*amp;if(x===left)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.strokeStyle=scene==="sound"?palette.purple:palette.blue;ctx.lineWidth=6;ctx.stroke();
        line(left+50,mid-amp,left+50,mid+amp,palette.pink,3);text(`振幅 ${d.amplitude}`,left+82,mid-amp-18,15,palette.pink);text(`频率 ${d.frequency} · 相对波长 ${d.wavelength}`,w/2,58,22,palette.purple);
        if(scene==="sound"){circle(w*.82,h*.23,28,palette.yellow);ctx.beginPath();ctx.arc(w*.82,h*.23,48,-.7,.7);ctx.strokeStyle=palette.pink;ctx.lineWidth=5;ctx.stroke();text("声源振动",w*.82,h*.34,15,palette.ink);}
    }
    function drawOptics(w,h) {
        const compact=w<520,d=engine.derive(scene,values),cx=w*(compact?.5:.48),cy=h*(compact?.54:.5),len=Math.min(w,h)*(compact?.31:.42),inc=d.incidenceAngle*Math.PI/180,ref=d.refractionAngle*Math.PI/180;
        ctx.fillStyle="rgba(49,133,255,.08)";ctx.fillRect(0,cy,w,h-cy);line(compact?24:55,cy,w-(compact?24:55),cy,palette.blue,4);line(cx,compact?58:55,cx,h-(compact?42:55),palette.muted,2,[8,7]);text("空气",compact?35:w*.12,cy-22,compact?13:16,palette.muted);text(`介质 n=${values.index}`,compact?62:w*.12,cy+24,compact?13:16,palette.blue);
        arrow(cx-len*Math.sin(inc),cy-len*Math.cos(inc),cx,cy,palette.yellow,6);arrow(cx,cy,cx+len*Math.sin(ref),cy+len*Math.cos(ref),palette.pink,6);arrow(cx,cy,cx+len*Math.sin(inc),cy-len*Math.cos(inc),palette.mint,4);
        text(`入射角 ${d.incidenceAngle}°`,compact?61:cx-95,compact?cy-72:cy-90,compact?14:17,palette.purple);text(`折射角 ${d.refractionAngle}°`,compact?w-74:cx+110,compact?cy+72:cy+90,compact?14:17,palette.pink);text("反射角 = 入射角",compact?w/2:w*.77,compact?28:55,compact?15:18,palette.mint);
    }
    function drawForce(w,h) {
        const compact=w<520,d=engine.derive("force",values),ground=h*(compact?.72:.7),cx=w*.5,bodyHalf=compact?70:95;line(compact?24:70,ground,w-(compact?24:70),ground,"#8696a8",5);roundRect(cx-bodyHalf,ground-(compact?90:120),bodyHalf*2,compact?82:112,15,"#eef5ff",palette.blue,4);circle(cx-(compact?43:60),ground-5,compact?15:18,palette.ink);circle(cx+(compact?43:60),ground-5,compact?15:18,palette.ink);
        if(compact){const maxArrow=w/2-36,frictionLength=maxArrow*values.friction/15,forceLength=maxArrow*values.force/20,arrowY=140;arrow(cx-8,arrowY,cx-8-frictionLength,arrowY,palette.pink,6);arrow(cx+8,arrowY,cx+8+forceLength,arrowY,palette.mint,6);text(`摩擦 ${values.friction} N`,w*.25,108,14,palette.pink);text(`推力 ${values.force} N`,w*.75,108,14,palette.mint);text(`合力 ${d.netForce} N · ${d.direction}`,w/2,38,20,palette.purple);}
        else{arrow(cx-95,ground-72,cx-95-values.friction*10,ground-72,palette.pink,7);arrow(cx+95,ground-72,cx+95+values.force*10,ground-72,palette.mint,7);text(`摩擦 ${values.friction} N`,cx-170,ground-105,16,palette.pink);text(`推力 ${values.force} N`,cx+180,ground-105,16,palette.mint);text(`合力 ${d.netForce} N · ${d.direction}`,w/2,70,27,palette.purple);}
    }
    function drawShapes(w,h) {
        const compact=w<520,d=engine.derive("shapes",values),cx=w*(compact?.5:.39),cy=h*.52,scale=Math.min(compact?92:145,h*(compact?.26:.31)),turn=values.turn*Math.PI/180,tilt=-.5,camera=5;
        const cube=[[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
        const edges=[[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
        const faces=[
            {ids:[0,1,2,3],fill:"rgba(49,133,255,.13)"},{ids:[4,5,6,7],fill:"rgba(124,77,255,.2)"},
            {ids:[0,1,5,4],fill:"rgba(32,201,151,.16)"},{ids:[1,2,6,5],fill:"rgba(255,91,143,.15)"},
            {ids:[3,2,6,7],fill:"rgba(255,189,46,.2)"},{ids:[0,3,7,4],fill:"rgba(49,133,255,.18)"}
        ];
        const project=(point)=>{
            const [x,y,z]=point,rx=x*Math.cos(turn)+z*Math.sin(turn),rz=-x*Math.sin(turn)+z*Math.cos(turn),ry=y*Math.cos(tilt)-rz*Math.sin(tilt),depth=y*Math.sin(tilt)+rz*Math.cos(tilt),factor=camera/(camera-depth);
            return [cx+rx*scale*factor,cy-ry*scale*factor,depth];
        };
        const projected=cube.map(project);
        const polygon=(points,fill,stroke,width,dash)=>{ctx.beginPath();points.forEach((point,index)=>index?ctx.lineTo(point[0],point[1]):ctx.moveTo(point[0],point[1]));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.setLineDash(dash||[]);ctx.strokeStyle=stroke;ctx.lineWidth=width||2;ctx.stroke();ctx.setLineDash([]);}};

        faces.map(face=>({...face,points:face.ids.map(id=>projected[id]),depth:face.ids.reduce((sum,id)=>sum+projected[id][2],0)/4})).sort((a,b)=>a.depth-b.depth).forEach(face=>polygon(face.points,face.fill,"rgba(70,91,126,.22)",1.5));

        const planeCenter=[d.planeValue/3,d.planeValue/3,d.planeValue/3],u=[1/Math.sqrt(2),-1/Math.sqrt(2),0],v=[1/Math.sqrt(6),1/Math.sqrt(6),-2/Math.sqrt(6)],planeSize=1.72;
        const planeCorners=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([su,sv])=>planeCenter.map((value,axis)=>value+u[axis]*planeSize*su+v[axis]*planeSize*sv)).map(project);
        polygon(planeCorners,"rgba(255,189,46,.2)","rgba(217,143,0,.8)",2,[8,6]);

        edges.forEach(([a,b])=>line(projected[a][0],projected[a][1],projected[b][0],projected[b][1],"rgba(61,83,111,.72)",2.5));
        const sectionPoints=d.vertices.map(project);
        ctx.save();ctx.shadowColor="rgba(255,91,143,.58)";ctx.shadowBlur=18;polygon(sectionPoints,"rgba(255,91,143,.48)","#ff3f7b",compact?5:7);ctx.restore();
        sectionPoints.forEach(point=>circle(point[0],point[1],compact?5:7,"#fff","#ff3f7b",3));

        if(!compact){
            const badgeX=w*.78,badgeY=h*.3;
            roundRect(w*.68,h*.16,w*.25,h*.48,12,"rgba(255,255,255,.94)","#ffd1df",2);
            text("当前真实截面",badgeX,badgeY-28,16,palette.muted);
            text(d.shape,badgeX,badgeY+18,34,palette.pink);
            text(`${d.vertexCount} 个交点 = ${d.vertexCount} 条截面边`,badgeX,badgeY+65,15,palette.purple);
            text("拖动“截面位置”",badgeX,badgeY+112,14,palette.muted);
            text("观察形状怎样变化",badgeX,badgeY+136,14,palette.muted);
        }
    }
    function drawScene() {
        if(scene==="shapes"&&shape3d){updateShapeWebGL();return;}
        const {w,h}=fitCanvas();drawBackdrop(w,h);
        if(isPlaneFigures) drawPlaneFigures(w,h);
        else if(scene==="shapes") drawShapes(w,h);
        else if(scene==="numberline") drawNumberline(w,h);
        else if(scene==="algebra") drawAlgebra(w,h);
        else if(scene==="angle") drawAngle(w,h);
        else if(scene==="chart") drawChart(w,h);
        else if(scene==="area") drawArea(w,h);
        else if(scene==="parallel") drawParallel(w,h);
        else if(scene==="probability") drawProbability(w,h);
        else if(scene==="triangle") drawTriangle(w,h);
        else if(scene==="symmetry") drawSymmetry(w,h);
        else if(["function","function-table","proportion","linear","graph-review"].includes(scene)) drawFunction(w,h);
        else if(scene==="pythagorean") drawPythagorean(w,h);
        else if(scene==="path") drawPath(w,h);
        else if(scene==="real") drawReal(w,h);
        else if(scene==="coordinate") drawCoordinate(w,h);
        else if(scene==="transform") drawTransform(w,h);
        else if(scene==="measurement") drawMeasurement(w,h);
        else if(scene==="motion") drawMotion(w,h);
        else if(scene==="error") drawError(w,h);
        else if(scene==="wave"||scene==="sound") drawWave(w,h);
        else if(scene==="optics"||scene==="optics-review") drawOptics(w,h);
        else if(scene==="force") drawForce(w,h);
        else drawAlgebra(w,h);
    }

    function readout() {
        const d=engine.derive(scene,values);
        if(isPlaneFigures){
            if(planeModule==="lines"){const labels={segment:"线段",ray:"射线",line:"直线"},challengeLabels={segment:"图形 A",ray:"图形 B",line:"图形 C"};return `${difficultyId==="challenge"?challengeLabels[planeLineType]:labels[planeLineType]} · 分点 ${planePoint}%`;}
            if(planeModule==="angles"){const kind=planeAngle<90?"锐角":planeAngle===90?"直角":planeAngle<180?"钝角":"平角";return `${planeAngle}° · ${difficultyId==="challenge"?"请自行判断":kind}`;}
            if(planeModule==="polygons")return `${planeSides} 条边 · ${planeSides} 个顶点`;
            return `半径 ${planeRadius} · 圆心角 ${planeSector}°`;
        }
        if(scene==="shapes"){
            if(shapeModule==="solids"){const solid=solidCatalog[shapeSolid];return `${solid.label} · ${solid.faces} 面 · ${solid.edges} 棱 · ${solid.vertices} 顶点`;}
            if(shapeModule==="nets")return `折叠进度 ${shapeFold}%`;
            if(shapeModule==="views")return `${solidCatalog[shapeSolid].label} · ${shapeViewMode}`;
            return `${d.shape} · ${d.vertexCount} 个交点`;
        }
        if(scene==="numberline") return `${d.start} ${d.move>=0?"+":"-"} ${Math.abs(d.move)} = ${d.end}`;
        if(scene==="pythagorean") return `${values.a}² + ${values.b}² = ${d.hypotenuseArea}`;
        if(["function","function-table","proportion","linear"].includes(scene)) return d.expression;
        if(scene==="motion") return `路程 ${d.distance} m`;
        if(scene==="force") return `合力 ${d.netForce} N`;
        if(scene==="optics"||scene==="optics-review") return `折射角 ${d.refractionAngle}°`;
        if(scene==="measurement") return `读数 ${d.reading} mm`;
        if(scene==="error") return `相对误差 ${d.relativeError}%`;
        if(scene==="probability") return `期望约 ${d.expected} 次`;
        if(scene==="triangle") return `面积 ${d.area}，内角和 180°`;
        if(scene==="real") return `√${values.radicand} ≈ ${d.value}`;
        if(scene==="coordinate") return d.quadrant;
        if(scene==="transform") return d.rule;
        if(scene==="wave"||scene==="sound") return `振幅 ${d.amplitude} · 频率 ${d.frequency}`;
        return session.controls.map(c=>`${c.label} ${values[c.key]}`).join(" · ");
    }
    function explanationForWrong() {
        if(isPlaneFigures){
            if(planeModule==="lines")return "先数端点，再看箭头：线段无箭头，射线一个箭头，直线两个箭头。";
            if(planeModule==="angles")return "把角度与 90°、180° 比较，再判断锐角、直角、钝角或平角。";
            if(planeModule==="polygons")return "多边形的边首尾相接，边数始终等于顶点数。";
            return "整圆是 360°，扇形所占比例等于圆心角除以 360°。";
        }
        if(scene==="shapes"){
            if(shapeModule==="solids")return "先查看模型右上角的面、棱、顶点数量，并注意是否包含曲面。";
            if(shapeModule==="nets")return "把展开图完整折叠一次，观察六个面是否重叠以及能否封闭。";
            if(shapeModule==="views")return "分别切换主视图、俯视图和左视图，再比较三个方向的轮廓。";
        }
        const map={
            shapes:"截面有几条边，就表示切割平面同时穿过了几条棱。先数画面中的发光交点。",numberline:"先看方向：数轴向右增大，向左减小。",algebra:"只有字母和次数完全相同的项才能合并。",angle:"先和90°、180°两个界限比较。",chart:"先判断要表达数量、变化趋势还是总体占比。",area:"面积表示长与宽的乘积，不是周长。",parallel:"区分同位角、内错角和同旁内角的位置。",probability:"少量实验有波动，次数增加后频率才逐渐稳定。",triangle:"可以把三个内角剪拼到一条直线上验证。",symmetry:"对应点连线被对称轴垂直平分。",pythagorean:"注意公式比较的是三边的平方。",path:"把立体表面展开后，最短路线才是一条直线。",measurement:"读数要先看分度值，并估读到下一位。",motion:"匀速关系是路程等于速度乘时间。",error:"多次测量只能减小偶然误差，不能消除所有误差。",sound:"振幅影响响度，频率影响音调。",wave:"波速相同时，频率越高波长越短。",optics:"反射角等于入射角；折射还受介质影响。",force:"先标出每个力的方向，再做同一直线上的加减。"
        };
        return map[scene]||"把问题中的关键词和画面读数逐一对应，再重新选择。";
    }

    function renderShapeModules() {
        if(isPlaneFigures){
            el.shapeModules.hidden=false;el.shapeOverlay.hidden=true;
            el.shapeModules.setAttribute("aria-label","基本平面图形实验主题");
            el.shapeModules.innerHTML=planeModules.map(module=>`<button type="button" data-plane-module="${module.id}" aria-selected="${module.id===planeModule}">${module.label}<small>${module.note}</small></button>`).join("");
            el.shapeModules.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{
                const next=button.dataset.planeModule;if(next===planeModule)return;planeModule=next;currentStage=0;maxStage=0;solved=false;changedKeys=new Set();planeHistory=new Set([`${planeModule}:initial`]);renderAll(false);
            }));
            return;
        }
        if(scene!=="shapes"){el.shapeModules.hidden=true;el.shapeOverlay.hidden=true;return;}
        el.shapeModules.hidden=false;
        el.shapeModules.setAttribute("aria-label","丰富的图形世界实验主题");
        el.shapeModules.innerHTML=shapeModules.map(module=>`<button type="button" data-module="${module.id}" aria-selected="${module.id===shapeModule}">${module.label}<small>${module.note}</small></button>`).join("");
        el.shapeModules.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{
            const next=button.dataset.module;if(next===shapeModule)return;shapeModule=next;currentStage=0;maxStage=0;solved=false;changedKeys=new Set();shapeHistory=new Set([engine.derive("shapes",values).shape]);solidHistory=new Set([shapeSolid]);viewHistory=new Set();shapeFold=0;shapeViewMode="立体观察";setShapeView("立体观察");renderAll(false);
        }));
    }

    function renderShapeOverlay() {
        if(scene!=="shapes"){el.shapeOverlay.hidden=true;return;}
        el.shapeOverlay.hidden=false;
        if(shapeModule==="solids"){
            const solid=solidCatalog[shapeSolid];
            el.shapeOverlay.innerHTML=`<strong>${solid.label}</strong><p>按住模型任意拖动，从不同方向观察它的结构。</p><div class="facts"><span>${solid.faces} 个面</span><span>${solid.edges} 条棱</span><span>${solid.vertices} 个顶点</span></div>`;
            return;
        }
        if(shapeModule==="nets"){
            el.shapeOverlay.innerHTML=`<strong>正方体展开图</strong><p>六个正方形从平面逐步围成立体。当前折叠进度 ${shapeFold}%。</p><div class="facts"><span>6 个面</span><span>大小相同</span><span>${shapeFold===100?"已经闭合":"正在折叠"}</span></div>`;
            return;
        }
        if(shapeModule==="sections"){
            const data=engine.derive("shapes",values);el.shapeOverlay.innerHTML=`<strong>真实几何截面</strong><p>粉色切面与立方体棱相交，每个发光交点对应截面的一条边。</p><div class="facts"><span>${data.shape}</span><span>${data.vertexCount} 个交点</span><span>${data.vertexCount} 条边</span></div>`;
            return;
        }
        const solid=solidCatalog[shapeSolid],circleTop=["cylinder","cone","sphere"].includes(shapeSolid),circleSides=shapeSolid==="sphere";
        el.shapeOverlay.innerHTML=`<strong>${solid.label}的三视图</strong><p>三视图是从正面、上面和左面看到的平面轮廓。</p><div class="views"><span><i class="${circleSides?"circle":""}"></i>主视图</span><span><i class="${circleTop?"circle":""}"></i>俯视图</span><span><i class="${circleSides?"circle":""}"></i>左视图</span></div>`;
    }

    function chooseShapeSolid(id) {
        if(!solidCatalog[id])return;shapeSolid=id;solidHistory.add(id);changedKeys.add("solid");if(shape3d)shape3d.currentSolid="";renderControls();onInteraction();
    }

    function renderShapeControls() {
        if(shapeModule==="solids"){
            el.controls.innerHTML=`<div class="control-top"><span>选择立体图形</span><output class="control-output">${solidCatalog[shapeSolid].label}</output></div><div class="choice-grid">${Object.entries(solidCatalog).map(([id,solid])=>`<button type="button" data-solid="${id}" aria-pressed="${id===shapeSolid}">${solid.label}</button>`).join("")}</div>`;
            el.controls.querySelectorAll("[data-solid]").forEach(button=>button.addEventListener("click",()=>chooseShapeSolid(button.dataset.solid)));return;
        }
        if(shapeModule==="nets"){
            el.controls.innerHTML=`<label class="control"><div class="control-top"><span>折叠进度</span><output class="control-output" id="foldOutput">${difficultyId==="challenge"?"?":`${shapeFold}%`}</output></div><input type="range" id="foldRange" min="0" max="100" step="5" value="${shapeFold}"></label>`;
            el.controls.querySelector("#foldRange").addEventListener("input",event=>{shapeFold=Number(event.target.value);changedKeys.add("fold");el.controls.querySelector("#foldOutput").textContent=difficultyId==="challenge"?"?":`${shapeFold}%`;onInteraction();});return;
        }
        if(shapeModule==="views"){
            const viewSolids=["cube","prism","cylinder","cone"];
            el.controls.innerHTML=`<div class="control-top"><span>选择观察模型</span><output class="control-output">${solidCatalog[shapeSolid].label}</output></div><div class="choice-grid">${viewSolids.map(id=>`<button type="button" data-solid="${id}" aria-pressed="${id===shapeSolid}">${solidCatalog[id].label}</button>`).join("")}</div><div class="control-top"><span>选择观察方向</span><output class="control-output">${shapeViewMode}</output></div><div class="choice-grid">${["主视图","俯视图","左视图","立体观察"].map(mode=>`<button type="button" data-view="${mode}" aria-pressed="${mode===shapeViewMode}">${mode}</button>`).join("")}</div>`;
            el.controls.querySelectorAll("[data-solid]").forEach(button=>button.addEventListener("click",()=>chooseShapeSolid(button.dataset.solid)));
            el.controls.querySelectorAll("[data-view]").forEach(button=>button.addEventListener("click",()=>{setShapeView(button.dataset.view);changedKeys.add("view");renderControls();onInteraction();}));return;
        }
        el.controls.innerHTML=session.controls.map(control=>`<label class="control"><div class="control-top"><span>${control.label}</span><output class="control-output" data-output="${control.key}">${control.hideValue?"?":values[control.key]}</output></div><input type="range" data-key="${control.key}" min="${control.min}" max="${control.max}" step="${control.step}" value="${values[control.key]}"></label>`).join("");
        el.controls.querySelectorAll("input").forEach(input=>input.addEventListener("input",()=>{values[input.dataset.key]=Number(input.value);changedKeys.add(input.dataset.key);onInteraction();}));
    }

    function recordPlaneState(key) {
        changedKeys.add(key);
        planeHistory.add(`${planeModule}:${planeLineType}:${planePoint}:${planeAngle}:${planeSides}:${planeSector}:${planeRadius}`);
        onInteraction();
    }

    function renderPlaneControls() {
        if(planeModule==="lines"){
            const labels={segment:"线段",ray:"射线",line:"直线"},challengeLabels={segment:"图形 A",ray:"图形 B",line:"图形 C"},displayLabels=difficultyId==="challenge"?challengeLabels:labels;
            el.controls.innerHTML=`<div class="control-top"><span>选择线的类型</span><output class="control-output">${displayLabels[planeLineType]}</output></div><div class="choice-grid">${Object.entries(displayLabels).map(([id,label])=>`<button type="button" data-line-type="${id}" aria-pressed="${id===planeLineType}">${label}</button>`).join("")}</div><label class="control"><div class="control-top"><span>线段上的分点</span><output class="control-output" id="planePointOutput">${planePoint}%</output></div><input type="range" id="planePointRange" min="10" max="90" step="5" value="${planePoint}"></label>`;
            el.controls.querySelectorAll("[data-line-type]").forEach(button=>button.addEventListener("click",()=>{planeLineType=button.dataset.lineType;recordPlaneState("lineType");renderControls();}));
            el.controls.querySelector("#planePointRange").addEventListener("input",event=>{planePoint=Number(event.target.value);el.controls.querySelector("#planePointOutput").textContent=`${planePoint}%`;recordPlaneState("point");});return;
        }
        if(planeModule==="angles"){
            const step=difficultyId==="challenge"?1:difficultyId==="advanced"?5:10;
            el.controls.innerHTML=`<label class="control"><div class="control-top"><span>角度</span><output class="control-output" id="planeAngleOutput">${planeAngle}°</output></div><input type="range" id="planeAngleRange" min="0" max="180" step="${step}" value="${planeAngle}"></label>${difficultyId==="challenge"?"":`<div class="choice-grid"><button type="button" data-angle="45">锐角 45°</button><button type="button" data-angle="90">直角 90°</button><button type="button" data-angle="135">钝角 135°</button><button type="button" data-angle="180">平角 180°</button></div>`}`;
            el.controls.querySelector("#planeAngleRange").addEventListener("input",event=>{planeAngle=Number(event.target.value);el.controls.querySelector("#planeAngleOutput").textContent=`${planeAngle}°`;recordPlaneState("angle");});
            el.controls.querySelectorAll("[data-angle]").forEach(button=>button.addEventListener("click",()=>{planeAngle=Number(button.dataset.angle);recordPlaneState("angle");renderControls();}));return;
        }
        if(planeModule==="polygons"){
            el.controls.innerHTML=`<label class="control"><div class="control-top"><span>多边形边数</span><output class="control-output" id="planeSidesOutput">${planeSides} 边</output></div><input type="range" id="planeSidesRange" min="3" max="8" step="1" value="${planeSides}"></label><div class="choice-grid"><button type="button" data-sides="3">三角形</button><button type="button" data-sides="4">四边形</button><button type="button" data-sides="6">六边形</button><button type="button" data-sides="8">八边形</button></div>`;
            el.controls.querySelector("#planeSidesRange").addEventListener("input",event=>{planeSides=Number(event.target.value);el.controls.querySelector("#planeSidesOutput").textContent=`${planeSides} 边`;recordPlaneState("sides");});
            el.controls.querySelectorAll("[data-sides]").forEach(button=>button.addEventListener("click",()=>{planeSides=Number(button.dataset.sides);recordPlaneState("sides");renderControls();}));return;
        }
        el.controls.innerHTML=`<label class="control"><div class="control-top"><span>半径</span><output class="control-output" id="planeRadiusOutput">${planeRadius}</output></div><input type="range" id="planeRadiusRange" min="3" max="9" step="1" value="${planeRadius}"></label><label class="control"><div class="control-top"><span>圆心角</span><output class="control-output" id="planeSectorOutput">${planeSector}°</output></div><input type="range" id="planeSectorRange" min="20" max="360" step="${difficultyId==="challenge"?5:10}" value="${planeSector}"></label>`;
        el.controls.querySelector("#planeRadiusRange").addEventListener("input",event=>{planeRadius=Number(event.target.value);el.controls.querySelector("#planeRadiusOutput").textContent=planeRadius;recordPlaneState("radius");});
        el.controls.querySelector("#planeSectorRange").addEventListener("input",event=>{planeSector=Number(event.target.value);el.controls.querySelector("#planeSectorOutput").textContent=`${planeSector}°`;recordPlaneState("sector");});
    }

    function renderDifficulty() {
        el.difficultyButtons.innerHTML=baseModel.difficulties.map(item=>{
            const profile=lesson.difficultyProfiles&&lesson.difficultyProfiles[item.id];
            const hint=profile?`${profile.mode} · ${profile.hint}`:item.hint;
            return `<button type="button" data-id="${item.id}" aria-pressed="${item.id===difficultyId}">${item.label}<small>${hint}</small></button>`;
        }).join("");
        el.difficultyButtons.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{
            difficultyId=button.dataset.id;session=baseModel.createSession(lessonId,difficultyId);currentStage=0;maxStage=0;solved=false;initializeValues();if(scene==="shapes")setShapeView("立体观察");renderAll();
        }));
    }
    function renderSteps() {
        el.stepButtons.innerHTML=activeStages().map((stage,index)=>`<button class="step${index===currentStage?" active":""}${index<currentStage||index<maxStage?" done":""}" type="button" data-index="${index}" ${index>maxStage?"disabled":""}><span>${index<maxStage?"✓":index+1}</span><strong>${stage.title}</strong></button>`).join("");
        el.stepButtons.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{const index=Number(button.dataset.index);if(index<=maxStage){currentStage=index;renderAll(false);}}));
    }
    function renderControls() {
        if(scene==="shapes"){renderShapeControls();return;}
        if(isPlaneFigures){renderPlaneControls();return;}
        el.controls.innerHTML=session.controls.map(control=>`<label class="control"><div class="control-top"><span>${control.label}</span><output class="control-output" data-output="${control.key}">${control.hideValue?"?":values[control.key]}</output></div><input type="range" data-key="${control.key}" min="${control.min}" max="${control.max}" step="${control.step}" value="${values[control.key]}"></label>`).join("");
        el.controls.querySelectorAll("input").forEach(input=>input.addEventListener("input",()=>{values[input.dataset.key]=Number(input.value);changedKeys.add(input.dataset.key);onInteraction();}));
    }
    function renderChallenge() {
        const challenge=activeChallenge(),limit=session.profile?challenge.options.length:difficultyId==="basic"?2:difficultyId==="advanced"?3:4;
        let options=challenge.options.slice(0,limit);if(!options.includes(challenge.answer))options[options.length-1]=challenge.answer;
        const unlocked=maxStage>=2||currentStage===2;
        el.challengeQuestion.textContent=challenge.question;
        el.challengeStatus.textContent=solved?"已通过":unlocked?"请选择最准确的答案":"完成前两步后解锁";
        el.answers.innerHTML=options.map(option=>`<button class="answer" type="button" data-answer="${option}" ${!unlocked||solved?"disabled":""}>${option}</button>`).join("");
        el.answers.querySelectorAll("button").forEach(button=>button.addEventListener("click",()=>{
            if(scene==="shapes"&&shapeModule==="sections"&&session.profile&&session.profile.requiredSlice!==undefined&&Number(values.slice)!==session.profile.requiredSlice){el.feedback.className="feedback error";el.feedback.textContent=`先把截面位置调回 ${session.profile.requiredSlice}，再根据中央截面作答。`;return;}
            if(scene==="shapes"&&shapeModule==="sections"&&session.profile&&session.profile.requiredShape&&currentShape()!==session.profile.requiredShape){el.feedback.className="feedback error";el.feedback.textContent=`当前还是${currentShape()}。请先移动切面做出${session.profile.requiredShape}，再完成闯关。`;return;}
            if(scene==="shapes"&&shapeModule==="nets"&&difficultyId==="challenge"&&shapeFold<100){el.feedback.className="feedback error";el.feedback.textContent="请先把展开图完整折叠闭合，再完成闯关。";return;}
            if(scene==="shapes"&&shapeModule==="views"&&viewHistory.size<3){el.feedback.className="feedback error";el.feedback.textContent="请先查看主视图、俯视图和左视图三个方向。";return;}
            if(button.dataset.answer===challenge.answer){solved=true;button.classList.add("correct");el.feedback.className="feedback success";el.feedback.textContent=`回答正确。你已经用操作和判断完成了“${lesson.mission}”。`;el.statusBadge.textContent="本节已完成";el.challengeStatus.textContent="已通过";el.answers.querySelectorAll("button").forEach(b=>b.disabled=true);window.parent.postMessage({type:"interactive-lesson-complete",lessonId,difficulty:difficultyId},window.location.origin);
            }else{button.classList.add("wrong");el.feedback.className="feedback error";el.feedback.textContent=`这次判断不对。${explanationForWrong()}`;}
        }));
    }
    function onInteraction() {
        recordShape();
        if(isPlaneFigures)planeHistory.add(`${planeModule}:${planeLineType}:${planePoint}:${planeAngle}:${planeSides}:${planeSector}:${planeRadius}`);
        if(!isPlaneFigures&&(scene!=="shapes"||shapeModule==="sections"))el.controls.querySelectorAll("input").forEach(input=>{input.value=values[input.dataset.key];const output=el.controls.querySelector(`[data-output="${input.dataset.key}"]`),control=session.controls.find(item=>item.key===input.dataset.key);if(output)output.textContent=control&&control.hideValue?"?":values[input.dataset.key];});
        el.liveReadout.textContent=readout();drawScene();
        renderShapeOverlay();
        updateAdvanceState();
        el.coachText.textContent=scene==="shapes"?shapeCoachText():isPlaneFigures?planeCoachText():currentStage===0?"画面与读数已经同步变化。再试一个不同数值，确认不是偶然。":currentStage===1?`已经改变 ${changedKeys.size} 个条件。尝试用一句话说出不变的规律。`:"现在不要猜答案，先用画面中的关系验证后再选择。";
    }

    function renderLevelGuidance() {
        if(!session.profile){el.levelBrief.hidden=true;el.shapeGuide.hidden=true;return;}
        const difficulty=baseModel.getDifficulty(difficultyId),stages=activeStages();
        el.levelBrief.hidden=false;el.levelBrief.dataset.difficulty=difficultyId;
        el.levelMode.textContent=`${difficulty.label} · ${session.profile.mode}`;
        el.levelSummary.textContent=session.profile.summary;
        el.shapeGuide.hidden=false;
        el.shapeGuide.innerHTML=stages.map((stage,index)=>`<div class="${index===currentStage?"current":index<currentStage||index<maxStage?"done":""}"><b>${index<maxStage?"✓":index+1}. ${stage.title}</b>${stage.task.replace(/^① |^② |^③ /,"")}</div>`).join("");
    }

    function renderAll(rebuildDifficulty=true) {
        cancelAnimationFrame(animationFrame);
        if(rebuildDifficulty)renderDifficulty();
        renderShapeModules();renderSteps();renderControls();renderChallenge();
        const stage=activeStages()[currentStage];renderLevelGuidance();
        const moduleInfo=scene==="shapes"?shapeModules.find(item=>item.id===shapeModule):isPlaneFigures?planeModules.find(item=>item.id===planeModule):null;
        el.lessonTitle.textContent=lesson.title;el.lessonSubtitle.textContent=session.profile?`${session.profile.mode} · ${session.profile.summary}`:`${lesson.mission} · 三步完成本节学习闭环`;el.sceneName.textContent=moduleInfo?`${moduleInfo.label}实验`:sceneNames[scene]||"专属互动场景";el.stageTitle.textContent=stage.title;el.missionText.textContent=session.profile?stage.task:`${stage.task} ${session.prompt}`;
        el.canvasNote.textContent=scene==="shapes"&&shape3d?(shapeModule==="solids"?"按住模型任意拖动 · 右侧切换七种立体":shapeModule==="nets"?"拖动右侧滑块 · 观察六个面展开与闭合":shapeModule==="views"?"选择观察方向 · 对照主视图、俯视图和左视图":difficultyId==="basic"?"先拖动模型观察 · 再移动截面数交点":difficultyId==="advanced"?"对比中心与顶点附近的截面":"自由旋转 · 独立做出三角形截面"):isPlaneFigures?(planeModule==="lines"?"切换线的类型 · 观察端点和箭头":planeModule==="angles"?"拖动角度 · 对照 90° 和 180°":planeModule==="polygons"?"改变边数 · 数清边和顶点":"改变半径和圆心角 · 观察扇形比例"):draggableScenes.has(scene)?"可以直接拖动画面，也可以调整右侧参数":"调整右侧参数，画面和公式会同步更新";
        el.statusBadge.textContent=solved?"本节已完成":`${session.profile?session.profile.mode:"学习"} · 第 ${currentStage+1}/3 步`;el.advanceButton.textContent=currentStage<2?"完成本步，继续":"完成自检后结束";updateAdvanceState();
        if(!solved){el.feedback.className="feedback";el.feedback.textContent=currentStage===2?"选择答案后，这里会解释判断依据。":"先完成观察和实验，自检将在第三步解锁。";}
        el.liveReadout.textContent=readout();el.coachText.textContent=scene==="shapes"?shapeCoachText():isPlaneFigures?planeCoachText():currentStage===0?"先改变一个参数，观察画面和数值如何一起变化。":currentStage===1?"同时调整两个条件，找出保持不变的规律。":"先根据画面完成判断，再选择答案。";drawScene();renderShapeOverlay();
    }
    el.advanceButton.addEventListener("click",()=>{if(currentStage>=2)return;maxStage=Math.max(maxStage,currentStage+1);currentStage+=1;changedKeys=new Set();renderAll(false);});
    el.resetButton.addEventListener("click",()=>{currentStage=0;maxStage=0;solved=false;initializeValues();if(scene==="shapes")setShapeView("立体观察");renderAll();});
    el.playButton.addEventListener("click",()=>{
        if(isPlaneFigures){
            cancelAnimationFrame(animationFrame);animationStart=performance.now();let lastStep=-1;
            const animatePlane=(now)=>{
                const progress=Math.min(1,(now-animationStart)/2400);
                if(planeModule==="lines"){
                    const types=["segment","ray","line"],step=Math.min(2,Math.floor(progress*3));
                    if(step!==lastStep){lastStep=step;planeLineType=types[step];renderControls();}
                    changedKeys.add("lineType");
                }else if(planeModule==="angles"){
                    planeAngle=Math.round((15+150*progress)/(difficultyId==="challenge"?1:5))*(difficultyId==="challenge"?1:5);
                    const range=el.controls.querySelector("#planeAngleRange"),output=el.controls.querySelector("#planeAngleOutput");if(range)range.value=planeAngle;if(output)output.textContent=`${planeAngle}°`;changedKeys.add("angle");
                }else if(planeModule==="polygons"){
                    planeSides=Math.min(8,3+Math.floor(progress*6));
                    const range=el.controls.querySelector("#planeSidesRange"),output=el.controls.querySelector("#planeSidesOutput");if(range)range.value=planeSides;if(output)output.textContent=`${planeSides} 边`;changedKeys.add("sides");
                }else{
                    planeSector=Math.round((30+300*progress)/5)*5;
                    const range=el.controls.querySelector("#planeSectorRange"),output=el.controls.querySelector("#planeSectorOutput");if(range)range.value=planeSector;if(output)output.textContent=`${planeSector}°`;changedKeys.add("sector");
                }
                planeHistory.add(`${planeModule}:${planeLineType}:${planePoint}:${planeAngle}:${planeSides}:${planeSector}:${planeRadius}`);onInteraction();if(progress<1)animationFrame=requestAnimationFrame(animatePlane);
            };
            animationFrame=requestAnimationFrame(animatePlane);return;
        }
        if(scene==="shapes"&&shapeModule==="solids"){
            const ids=Object.keys(solidCatalog),next=ids[(ids.indexOf(shapeSolid)+1)%ids.length];chooseShapeSolid(next);return;
        }
        if(scene==="shapes"&&shapeModule==="views"){
            const modes=["主视图","俯视图","左视图","立体观察"],next=modes[(modes.indexOf(shapeViewMode)+1)%modes.length];setShapeView(next);changedKeys.add("view");renderControls();onInteraction();return;
        }
        if(scene==="shapes"&&shapeModule==="nets"){
            cancelAnimationFrame(animationFrame);animationStart=performance.now();
            const animateFold=(now)=>{const progress=Math.min(1,(now-animationStart)/2200);shapeFold=Math.round(progress*20)*5;changedKeys.add("fold");const range=el.controls.querySelector("#foldRange"),output=el.controls.querySelector("#foldOutput");if(range)range.value=shapeFold;if(output)output.textContent=difficultyId==="challenge"?"?":`${shapeFold}%`;onInteraction();if(progress<1)animationFrame=requestAnimationFrame(animateFold);};animationFrame=requestAnimationFrame(animateFold);return;
        }
        cancelAnimationFrame(animationFrame);animationStart=performance.now();const control=session.controls[0],center=(control.min+control.max)/2,amp=(control.max-control.min)*.44;
        const animate=(now)=>{const elapsed=now-animationStart,progress=Math.min(1,elapsed/2400),raw=center+Math.sin(progress*Math.PI*2)*amp,steps=Math.round((raw-control.min)/control.step),value=Number((control.min+steps*control.step).toFixed(3));values[control.key]=Math.max(control.min,Math.min(control.max,value));changedKeys.add(control.key);if(currentStage===1&&session.controls[1])changedKeys.add(session.controls[1].key);onInteraction();if(progress<1)animationFrame=requestAnimationFrame(animate);};animationFrame=requestAnimationFrame(animate);
    });
    function pointerValue(event) {
        const rect=el.canvas.getBoundingClientRect();return {x:event.clientX-rect.left,y:event.clientY-rect.top,w:rect.width,h:rect.height};
    }
    function updateFromPointer(event) {
        if(!draggableScenes.has(scene))return;const p=pointerValue(event),first=session.controls[0],second=session.controls[1];
        if(isPlaneFigures){
            if(planeModule==="lines"){const left=p.w<620?48:p.w*.15,right=p.w<620?p.w-48:p.w*.76;planePoint=Math.round(Math.max(10,Math.min(90,(p.x-left)/(right-left)*100))/5)*5;recordPlaneState("point");renderControls();}
            else if(planeModule==="angles"){const cx=p.w<620?p.w*.38:p.w*.35,cy=p.h*.7,angle=Math.atan2(cy-p.y,p.x-cx)*180/Math.PI,step=difficultyId==="challenge"?1:difficultyId==="advanced"?5:10;planeAngle=Math.round(Math.max(0,Math.min(180,angle))/step)*step;recordPlaneState("angle");renderControls();}
            else if(planeModule==="circles"){const compact=p.w<620,cx=compact?p.w/2:p.w*.38,cy=p.h*(compact?.32:.53),angle=(Math.atan2(p.y-cy,p.x-cx)*180/Math.PI+450)%360;planeSector=Math.max(20,Math.min(360,Math.round(angle/5)*5));recordPlaneState("sector");renderControls();}
            return;
        }
        if(scene==="numberline"){
            const d=engine.derive("numberline",values),compact=p.w<520,left=compact?28:75,right=p.w-left,domainMin=Math.floor(Math.min(-10,d.start,d.end)/5)*5,domainMax=Math.ceil(Math.max(10,d.start,d.end)/5)*5,raw=domainMin+(domainMax-domainMin)*(p.x-left)/(right-left),step=first.step||1;
            values.value=Math.max(first.min,Math.min(first.max,Math.round((raw-first.min)/step)*step+first.min));
        }
        else if(scene==="angle"||scene==="optics"||scene==="optics-review")values[first.key]=Math.max(first.min,Math.min(first.max,Math.round((1-p.y/p.h)*(first.max-first.min)/first.step)*first.step+first.min));
        else if(scene==="coordinate"){values.x=Math.max(first.min,Math.min(first.max,Math.round((p.x/p.w-.5)*16)));values.y=Math.max(second.min,Math.min(second.max,Math.round((.54-p.y/p.h)*12)));changedKeys.add(second.key);}
        else if(scene==="transform"){values.dx=Math.max(first.min,Math.min(first.max,Math.round((p.x/p.w-.5)*12)));values.dy=Math.max(second.min,Math.min(second.max,Math.round((.54-p.y/p.h)*10)));changedKeys.add(second.key);}
        else if(scene==="symmetry"){
            const axis=p.w*values.axis/100,maxOffset=first.max||7,unit=Math.max(.001,Math.min(38,p.w/25,(axis-24)/maxOffset,(p.w-axis-24)/maxOffset)),raw=Math.abs(p.x-axis)/unit,step=first.step||1;
            values.offset=Math.max(first.min,Math.min(first.max,Math.round((raw-first.min)/step)*step+first.min));
        }
        else if(scene==="triangle"){values.height=Math.max(second.min,Math.min(second.max,Math.round((1-p.y/p.h)*9)));changedKeys.add(second.key);}
        else if(scene==="real")values.radicand=Math.max(first.min,Math.min(first.max,Math.round(Math.pow(p.x/p.w*7,2))));
        changedKeys.add(first.key);onInteraction();
    }
    el.canvas.addEventListener("pointerdown",event=>{if(!draggableScenes.has(scene))return;pointerDown=true;el.canvas.setPointerCapture(event.pointerId);updateFromPointer(event);});
    el.canvas.addEventListener("pointermove",event=>{if(pointerDown)updateFromPointer(event);});
    el.canvas.addEventListener("pointerup",()=>{pointerDown=false;});
    el.canvas.addEventListener("pointercancel",()=>{pointerDown=false;});
    el.canvas.addEventListener("lostpointercapture",()=>{pointerDown=false;});
    window.addEventListener("resize",drawScene);

    initializeValues();
    if(scene==="shapes")setupShapeWebGL();
    renderAll();
    // 移动端首屏的布局尺寸可能在脚本执行后才稳定，尺寸变化后必须重新绘制画布。
    const sceneResizeObserver = new ResizeObserver(() => drawScene());
    sceneResizeObserver.observe(scene==="shapes"&&shape3d?el.shapeCanvas:el.canvas);
    requestAnimationFrame(drawScene);
})();
