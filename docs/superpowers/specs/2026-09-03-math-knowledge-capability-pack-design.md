# 数学知识点能力包与自适应诊断设计

## 1. 目标

在保留现有数学互动课件的前提下，将“教材知识点、互动游戏、考察题目、AI 变式出题、评分诊断、针对学习和再次测试”连接为同一套学习闭环。

第一批交付以北师大版七年级上册第一章“丰富的图形世界”为完整样板，覆盖：

- 生活中的立体图形
- 展开与折叠
- 截一个几何体
- 从三个方向看物体

同时恢复现有数学课程与真实互动课件文件之间的映射，避免课程目录统一落入通用 `concept-studio` 页面。

本规格取代 `2026-09-02-student-daily-learning-loop-design.md` 中数学固定任务的设计；语文、英语既有三步练习暂不改变。

## 2. 范围

### 2.1 本次包含

- 恢复已有七年级数学专用互动课件入口。
- 建立可扩展的数学知识点能力包数据模型。
- 为第一章四个知识点各提供不少于 10 个已校验考察任务。
- 将普通选择题、判断题和真实互动图形题统一纳入测试流程。
- 根据答题结果按知识点和能力标签生成诊断。
- 未达到 98 分时进入对应互动游戏，再进行同知识点变式测试。
- 接入当前临时模型测试会话，支持 AI 生成结构化变式题。
- AI 不可用或生成结果校验失败时，使用本地题库完成全部学习流程。
- 适配桌面端和手机端，保持明亮、高对比、多色但不杂乱的学生界面。

### 2.2 本次不包含

- 批量完成语文、英语能力包。
- 批量为七年级数学其他章节补齐每知识点 10 题。
- OCR 拍题、教师审核后台和正式云端账号密钥存储。
- 使用大模型直接生成图片、Three.js 代码、HTML 或可执行脚本。
- 部署上线。

## 3. 核心学习流程

1. 学生选择数学、教材、章节及当天知识点。
2. 多选知识点进入学习队列，按知识点逐个处理。
3. 当前知识点先完成 10 个考察任务。
4. 系统按正确率和能力标签生成首次诊断。
5. 得分达到 98 分时，该知识点直接过关并进入队列下一项。
6. 未达到 98 分时，只打开该知识点对应的互动游戏和错因讲解。
7. 学生完成互动操作挑战后，系统生成或抽取 10 个同知识点变式任务。
8. 再次评分；最多进行三轮。
9. 三轮后仍未达到 98 分，标记为“重点复习”，建议向 AI 老师或教师求助。
10. 队列全部完成后生成今日总结、成长记录和待复习项。

每次只突出当前行动，不在同一屏同时展示选择、测试、诊断和互动游戏。

## 4. 现有互动课件复用

### 4.1 课程映射修复

`lesson-catalog.ts` 当前忽略 `_legacyAsset` 参数，除一元一次方程外，课程统一回落到 `concept-studio.html`。调整规则如下：

- `_legacyAsset` 以 `.html` 结尾时，直接映射到 `/interactive-lessons/sims/<文件名>`。
- `_legacyAsset` 为 `unified-*` 时，继续映射到 `concept-studio.html?lesson=<lessonId>`。
- 一元一次方程保留 `/interactive-lessons/sims/equation-lab.html` 专用映射。
- 所有映射必须经过自动化测试，确认目标文件存在。

### 4.2 第一章互动模式

复用 `chapter1-shapes-world.html`，增加稳定的查询参数：

- `section=shapes`：生活中的立体图形
- `section=fold`：展开与折叠
- `section=cut`：截一个几何体
- `section=views`：从三个方向看物体
- `difficulty=basic|advanced|challenge`：基础、进阶、挑战

课件通过 `postMessage` 向父页面发送结构化事件：

```ts
type InteractionResultMessage = {
  type: "math-interaction-result";
  lessonId: "g7-upper-shapes";
  knowledgePointId: string;
  section: "shapes" | "fold" | "cut" | "views";
  difficulty: "basic" | "advanced" | "challenge";
  challengeId: string;
  passed: boolean;
  attempts: number;
};
```

父页面只接受同源消息，并校验所有枚举值和字段类型。

## 5. 知识点能力包

每个知识点由一份独立数据描述，不把页面、题目和评分逻辑混写在组件中。

```ts
type MathKnowledgePackage = {
  id: string;
  subject: "数学";
  grade: 7;
  semester: "上册" | "下册";
  textbookVersion: "北师大版";
  chapterId: string;
  title: string;
  lessonId: string;
  interaction: {
    section: "shapes" | "fold" | "cut" | "views";
    supportedDifficulties: Array<"basic" | "advanced" | "challenge">;
  };
  capabilityTags: string[];
  questions: MathQuestion[];
};
```

第一章必须建立四个能力包，每包至少 10 个考察任务。这里的“10个”指可实际作答并计分的任务，不强制制造 10 种不适合该知识点的题型；每个能力包至少覆盖 4 种作答方式。

## 6. 题目与图形数据

### 6.1 统一题目结构

```ts
type MathQuestion = {
  id: string;
  knowledgePointId: string;
  capabilityTag: string;
  difficulty: "basic" | "advanced" | "challenge";
  responseType: "single-choice" | "true-false" | "multi-choice" | "interactive";
  prompt: string;
  options?: Array<{ id: string; text: string }>;
  correctAnswer: string | string[] | InteractionExpectedAnswer;
  explanation: string;
  visual?: MathVisualSpec;
  source: "local-reviewed" | "ai-generated";
};
```

### 6.2 图形题规则

- 需要看图的题目必须携带 `visual`，不允许只出现“如下图”文字。
- 立体图形使用现有 Three.js 场景渲染，不使用大模型生成图片。
- 展开与折叠题必须能执行折叠或选择对应面。
- 截面题必须显示立体模型和可移动截面平面。
- 三视图题必须显示可旋转物体，以及正面、左面、上面的观察入口。
- 图形由受控参数生成，正确答案由同一参数计算，避免图形与答案不一致。
- 图形加载失败时，题目不得计分，并提供“重新加载图形”按钮。

```ts
type MathVisualSpec =
  | { kind: "solid-model"; solid: "cube" | "cuboid" | "cylinder" | "cone" | "sphere" }
  | { kind: "folding-net"; netId: string; targetFace?: string }
  | { kind: "cross-section"; solid: "cube" | "cuboid" | "cylinder" | "cone" | "sphere"; planePreset: string }
  | { kind: "orthographic-view"; structureId: string; view: "front" | "left" | "top" };
```

## 7. 第一章题型覆盖

### 7.1 生活中的立体图形

- 实物与几何体匹配
- 面、棱、顶点数量判断
- 平面与曲面分类
- 旋转模型后识别几何体
- 组合体拆分

### 7.2 展开与折叠

- 判断展开图能否折成立方体
- 点击折叠后的对应面
- 判断相对面和相邻面
- 拖动折叠顺序
- 从立体图反选展开图

### 7.3 截一个几何体

- 判断可能或不可能的截面
- 拖动截面平面观察变化
- 根据截面反推截法
- 判断平行、倾斜截取结果
- 比较不同立体图形的截面

### 7.4 从三个方向看物体

- 立体图与主视图匹配
- 立体图与左视图匹配
- 立体图与俯视图匹配
- 根据两个视图补充第三个视图
- 根据三视图选择立体结构

每个能力包在上述类型内提供不少于 10 个独立任务，基础、进阶、挑战均有覆盖。

## 8. AI 变式出题

### 8.1 使用边界

AI 只生成结构化题目内容和受控图形参数，不生成可执行代码。前端不直接调用模型，所有请求经过后端代理，API Key 不进入浏览器日志或题目记录。

开发调试阶段复用 30 分钟临时模型会话，通过新增接口生成变式题：

```http
POST /api/v1/admin/math-question-generation-test
X-Model-Test-Session: <session-id>
```

请求只包含知识点、题型、难度、避免重复的题目 ID 和学生错因标签。响应必须符合 `MathQuestion` 的受限 JSON 结构。

### 8.2 校验流程

1. JSON 结构和字段长度校验。
2. 知识点、题型、难度和图形类型白名单校验。
3. 选项数量、答案引用和空值校验。
4. 与本轮及本地题库进行重复度检查。
5. 图形参数可渲染性检查。
6. 使用确定性规则重新计算可计算答案。
7. 任一检查失败即丢弃 AI 题，改用本地已审核题。

AI 题必须标记为“AI 变式题”，不得标记为真题或教材原题。

## 9. 评分与诊断

- 当前知识点的 10 个任务全部完成后才能提交。
- 普通题按正确答案计分；互动题按有效操作事件和最终结果共同计分。
- 总分为正确任务数除以有效任务数后四舍五入到整数。
- 图形加载失败或事件无效的任务不进入分母，并自动补题。
- 98 分及以上显示“已掌握”，隐藏“主要问题”，不允许出现“需巩固”或“未理解”。
- 低于 98 分时，只展示实际失分的能力标签。
- 能力正确率 100% 为“掌握”，60% 至 99% 为“需巩固”，低于 60% 为“未理解”。
- 诊断文案由规则模板生成；AI 可润色解释，但不能修改分数、标签和过关结论。

## 10. 页面结构

新增每日数学学习工作台，沿用已确认的“一步一屏”方式：

1. 选择教材知识点。
2. 显示当前知识点名称、互动游戏类型和本轮 10 个任务构成。
3. 逐题完成，图形题使用大面积互动区域。
4. 查看真实评分和能力诊断。
5. 进入对应互动游戏完成引导任务。
6. 返回同知识点变式测试。
7. 过关后自动进入下一个已选知识点。

手机端每次只显示题目或互动区，答案和主按钮放在其下方；不同时并排显示目录、题目和诊断。

## 11. 状态与持久化

新增独立学习会话状态，不继续把复杂测试数据塞入固定任务状态：

```ts
type MathLearningSession = {
  id: string;
  localDate: string;
  selectedKnowledgePointIds: string[];
  currentIndex: number;
  round: 1 | 2 | 3;
  phase: "diagnostic" | "diagnosis" | "learning" | "retest" | "passed" | "needs-help";
  answers: QuestionAttempt[];
  interactionResults: InteractionResultMessage[];
  scores: Array<{ round: number; score: number; weakTags: string[] }>;
};
```

当前调试阶段使用 `localStorage` 适配器保存，并通过纯函数接口隔离；后续替换为后端数据库时不重写页面流程。

## 12. 错误处理

- 模型未配置：显示“使用本地题库”，学习不中断。
- 模型超时、限流或响应错误：静默回退本地题库，并提供可展开的技术详情给管理员。
- AI 题校验失败：不向学生展示，记录失败原因但不记录 API Key。
- 互动课件加载失败：提供重新加载和返回题目两种操作。
- 页面刷新：恢复到最近已保存的题目或互动步骤。
- 重复提交：使用会话 ID、轮次和题目 ID 保证幂等。

## 13. 测试与自检

### 13.1 自动化测试

- 课程目录能解析到真实存在的专用课件文件。
- 四个能力包均不少于 10 个有效任务。
- 每个题目答案引用合法，图形参数属于白名单。
- 组卷只抽取当前知识点题目，不混入其他章节。
- 100 分诊断全部为“掌握”且不显示主要问题。
- 非 100 分诊断只列出真实错题对应标签。
- AI 响应非法、重复或不可渲染时回退本地题库。
- 刷新后能恢复学习队列、轮次和答题进度。
- iframe 消息来源和字段不合法时被拒绝。

### 13.2 浏览器验收

- 桌面端与手机端完成完整流程。
- 四种第一章互动模式均可打开、操作和返回结果。
- 每一道看图题都实际显示正确图形。
- 旋转、折叠、截面拖动和三视图切换可用。
- 键盘可完成普通题选择，触控可完成图形操作。
- 不出现遮挡、横向溢出和按钮不可见。

### 13.3 内容验收

- 对四个能力包共至少 40 个本地任务进行答案复核。
- 图形状态与答案由同一组参数产生。
- AI 题经过结构、答案、重复和图形参数四类校验。
- 学生在任何时刻只看到一个清楚的下一步。

## 14. 实施顺序

1. 修复现有互动课件映射并补回归测试。
2. 建立能力包、题目和学习会话的纯数据模型。
3. 完成第一章 40 个以上本地考察任务及校验测试。
4. 为第一章课件增加按知识点和难度直达能力。
5. 建立选择、测试、诊断、互动学习、再测试工作台。
6. 接入 AI 变式出题和严格回退机制。
7. 完成桌面、手机和完整学习闭环验收。

## 15. 兼容性约束

- 保持现有 Agent 架构和接口可继续使用。
- 不删除现有互动课件文件和课程卡片。
- 不新增第三方依赖；复用项目已有 Three.js。
- 不修改 `.env`，不保存或输出用户 API Key。
- 新流程独立于旧固定任务闭环，验收后再决定是否替换旧入口。
