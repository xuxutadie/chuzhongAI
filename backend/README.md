# 后端服务

FastAPI 后端负责学生账号、今日任务、草稿、错题、AI/OCR 受控调用。当前学生端默认使用本机 SQLite，不需要先配置 PostgreSQL。

## 启动

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
if (-not (Test-Path -LiteralPath .env)) { Copy-Item -LiteralPath .env.example -Destination .env }
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

学生数据默认写入 `data/ai_coach.db`；首次调用账号接口时会自动建表。默认绑定在 `127.0.0.1`，供同机前端 BFF 使用。

## 部署防呆

`.env.example` 的 `APP_ENV=development` 只适用于本机 `127.0.0.1`。部署到局域网、服务器或公网前必须设置：

```text
APP_ENV=production
BOOTSTRAP_SETUP_CODE=一段高强度且只用于首次初始化的随机字符串
```

生产环境中未设置初始化码时，`POST /api/v1/auth/bootstrap` 会返回 `503`；码缺失或错误时返回 `403`。请通过可信 HTTPS 反向代理暴露服务并限制来源，不要直接公开后端端口。

## 学生端接口

- `POST /api/v1/auth/bootstrap`：仅第一次创建教师/家长管理员。
- `POST /api/v1/auth/login`、`POST /api/v1/auth/logout`、`GET /api/v1/auth/me`：账号会话。
- `POST` / `GET /api/v1/teacher/students`、`POST /api/v1/teacher/students/{id}/reset-password`：教师管理自己创建的学生。
- `GET /api/v1/me/course-catalog`、`GET` / `PUT /api/v1/me/course-context`：学生读取并保存北师大版七年级上册六章的数学课程选择。
- `GET /api/v1/me/language-progress`：读取当前学生语文、英语单元最近学习和完成记录；不返回其他账号数据。
- `GET` / `PUT /api/v1/workspace/state`：当前学生自己的学习草稿。
- `GET /api/v1/me/tasks/today`、`POST /api/v1/me/tasks/{id}/start`、`POST /api/v1/me/tasks/{id}/complete`：每日学习路线。新学生可直接从语文、英语学科页开始任一已登记单元；数学任务仍要求先选课程。语言单元保存教材快照，服务端核验完整首测、不同的过关题、有效选项和反思后才记录完成。
- `GET /api/v1/me/integrations`、`GET /api/v1/teacher/ai-config/status`：只返回 AI/OCR 是否可用、服务名和模型名，不返回密钥。
- `POST /api/v1/wrong-questions/uploads`、`GET /api/v1/wrong-questions/uploads/{id}/image`、`DELETE /api/v1/wrong-questions/uploads/{id}`：先暂存并预览学生自己的错题图片；确认前可删除。
- `POST /api/v1/ocr/recognize`：将暂存图片识别为待确认题干、公式和图形说明。
- `/api/v1/wrong-questions`：当前学生错题的增删查改、图片读取和 AI 错因分析。
- `POST /api/v1/assistant`：学生答疑。
- `POST /api/v1/me/math-variant-questions`：仅能为当前学生已选择的可信数学知识点生成变式题，并登记服务端可信答案。

所有需要学生数据的接口都必须带有效会话。前端应通过同源 BFF 将令牌保留在 HttpOnly Cookie 中，不能把令牌或 API Key 存入浏览器本地存储。

同源 BFF 应为每个已认证请求原样转发页面启动时记录的可选请求头 `X-AI-Coach-Expected-User-Id`。它不是认证凭据，真正身份仍由服务端会话决定；若该值与当前会话用户 ID 不同，接口返回 `409`，并且**仅此情形**附带 `X-AI-Coach-Session-Context-Changed: 1`，防止浏览器多标签页切换账号后，旧页面的迟到请求写入新账号。BFF/页面只能根据这个专属响应头刷新会话，不能把其他业务 `409` 误当作账号切换。未带此头的既有直接 API 调用保持兼容。

## AI 与 OCR 配置

复制 `.env.example` 为 `.env`（已有配置时直接编辑，勿覆盖），再填写真实值：

```text
LLM_ENABLED=true
LLM_PROVIDER=
LLM_API_BASE_URL=
LLM_API_KEY=
LLM_MODEL=

OCR_ENABLED=true
OCR_PROVIDER=openai_compatible_vision
OCR_API_BASE_URL=
OCR_API_KEY=
OCR_MODEL=
```

LLM 与 OCR 均使用 OpenAI 兼容 Chat Completions 接口。`LLM_PROVIDER` 填服务名称或 `openai_compatible`；OCR 固定填 `openai_compatible_vision`。两项 `*_API_BASE_URL` 都应填写服务商提供的 HTTPS 基础地址，系统会自动追加 `/chat/completions`，不要填包含该后缀的完整请求地址。模型名应是服务商实际开通的模型标识，OCR 模型必须支持图片输入。

填写后重启后端，在教师端“AI 设置”重新检查配置状态。配置完整不等于外部服务已联通，还应以一次实际答疑或错题识别确认服务可用。未配置、服务超时或模型返回格式不可靠时，接口会返回可显示给学生的手动录入提示；不会伪造识别结果，也不会把密钥写入数据库或响应。

## AI 调用额度与缓存

为了避免单个已登录学生短时间重复消耗付费模型额度，后端按“学生账号 + AI 能力”分别采用 5 分钟滑动窗口：OCR 识题最多 6 次、错因分析最多 6 次、AI 答疑最多 12 次、数学变式题最多 6 次。达到上限时接口返回 `429`，并在 `Retry-After` 响应头中给出最短等待秒数；浏览器应提示学生稍后重试或继续使用手动/本地学习路径。

- 对同一张仍可访问的暂存图片，已有且通过公开契约校验的 OCR 结果会直接复用，不再次发送图片给模型，也不占用新额度。
- 同一条错题已有完整的已保存分析时会直接复用；缓存响应的 `model_name` 为“缓存结果”、`latency_ms` 为 `0`，表示本次没有外部模型调用。当前接口没有“强制刷新分析”参数。
- 该保护不改变未配置或外部服务出错时的手动降级语义。

当前限流记录保存在单个后端进程内存中：重启会清空，多个 worker 或多台服务器之间不会共享额度。需要横向扩容时，应在反向代理/API 网关或共享限流存储中实施等价的全局规则；不要把额度判断移到浏览器。

## 图片与数据保护

- 只接收 JPG、PNG、WebP，单张最大 5MB，并校验文件签名。
- 图片先处于 `staged` 状态；学生确认题干并保存后才会绑定错题。
- 错题列表绝不返回图片二进制；读取图片始终经过当前学生身份校验。
- 密码使用 scrypt 散列，会话与密码重置使用版本校验使旧会话失效。
- 同一账号连续 5 次登录失败会在服务端短时限流，并通过 `Retry-After` 告知浏览器等待时间。

## 测试

测试使用 Python 自带 unittest；接口测试另外需要测试环境中的 `httpx`。当前验收电脑已安装该测试工具，应用运行本身不依赖它。

```powershell
python -m unittest discover -s tests -v
```

开发时可访问 `http://127.0.0.1:8000/docs` 查看接口文档。旧 PostgreSQL 资料接口只保留在代码中供迁移，不再挂载为学生端公开接口。
