import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

async function importInstalledPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
  }

  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) {
    throw new Error("运行浏览器布局测试需要 Playwright；当前环境未安装且无法定位 Codex 浏览器运行时。");
  }

  const runtimeRoot = path.join(localAppData, "OpenAI", "Codex", "runtimes", "cua_node");
  const runtimeVersions = await fs.readdir(runtimeRoot).catch(() => []);
  for (const version of runtimeVersions.sort().reverse()) {
    const candidate = path.join(runtimeRoot, version, "bin", "node_modules", "playwright", "index.js");
    try {
      await fs.access(candidate);
      return await import(pathToFileURL(candidate).href);
    } catch {
      // 继续尝试下一个本机运行时版本。
    }
  }

  throw new Error("运行浏览器布局测试需要 Playwright；当前环境未找到可用运行时。");
}

function sendFile(response, filePath, contentType) {
  return fs.readFile(filePath).then((content) => {
    response.writeHead(200, { "content-type": contentType });
    response.end(content);
  });
}

export async function createBrowserLayoutRuntime() {
  const frontendRoot = fileURLToPath(new URL("../../", import.meta.url));
  const publicRoot = path.join(frontendRoot, "public");
  const lessonPath = path.join(
    frontendRoot,
    "public",
    "interactive-lessons",
    "sims",
    "chapter2-integers.html",
  );
  const lessonModelPath = path.join(
    frontendRoot,
    "public",
    "interactive-lessons",
    "sims",
    "chapter2-integers-model.js",
  );
  const globalStylesPath = path.join(frontendRoot, "app", "globals.css");
  const iframeAutoHeightPath = path.join(
    frontendRoot,
    "app",
    "interactive-lessons",
    "iframe-auto-height.mjs",
  );

  const server = http.createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      const pathname = requestUrl.pathname;
      if (pathname === "/interactive-lessons/sims/chapter2-integers.html") {
        await sendFile(response, lessonPath, "text/html; charset=utf-8");
        return;
      }
      if (pathname === "/interactive-lessons/sims/chapter2-integers-model.js") {
        await sendFile(response, lessonModelPath, "text/javascript; charset=utf-8");
        return;
      }
      if (pathname === "/app/globals.css") {
        // 与根布局保持相同顺序，布局回归也覆盖实际生效的主题。
        const stylesheets = [globalStylesPath, ...["learning-theme.css", "workspace-refinement.css", "blueprint-theme.css"].map(name => path.join(frontendRoot, "app", name))];
        const styles = await Promise.all(stylesheets.map(file => fs.readFile(file, "utf8")));
        response.writeHead(200, { "content-type": "text/css; charset=utf-8" });
        response.end(styles.join("\n"));
        return;
      }
      if (pathname === "/app/interactive-lessons/iframe-auto-height.mjs") {
        await sendFile(response, iframeAutoHeightPath, "text/javascript; charset=utf-8");
        return;
      }
      if (pathname === "/embedded-lesson-harness") {
        const requestedSource = requestUrl.searchParams.get("src") ?? "";
        const parsedSource = new URL(requestedSource || "/interactive-lessons/sims/chapter2-integers.html", "http://127.0.0.1");
        const frameSource = parsedSource.pathname.startsWith("/interactive-lessons/sims/")
          ? `${parsedSource.pathname}${parsedSource.search}`
          : "/interactive-lessons/sims/chapter2-integers.html";
        const escapedFrameSource = frameSource
          .replaceAll("&", "&amp;")
          .replaceAll('"', "&quot;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;");
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`<!doctype html>
          <html lang="zh-CN">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <link rel="stylesheet" href="/app/globals.css">
            </head>
            <body>
              <main class="workbench-content">
                <div class="interactive-player">
                  <section class="interactive-player-intro">
                    <div><p>第二章</p><h2>有理数及其运算</h2><span>互动课件</span></div>
                  </section>
                  <section class="interactive-frame-section" aria-label="有理数互动课件">
                    <iframe
                      class="interactive-frame"
                      src="${escapedFrameSource}"
                      title="有理数及其运算"
                    ></iframe>
                    <button class="interactive-frame-fallback-link" type="button">
                      课件显示异常？改用文字学习
                    </button>
                  </section>
                  <section class="interactive-checkpoint">
                    <h2>学习反馈</h2>
                    <textarea rows="4" aria-label="学习反馈"></textarea>
                  </section>
                </div>
              </main>
              <script type="module">
                import { observeIframeAutoHeight } from "/app/interactive-lessons/iframe-auto-height.mjs";
                const frame = document.querySelector(".interactive-frame");
                observeIframeAutoHeight(frame, (height) => {
                  frame.style.height = height + "px";
                });
              </script>
            </body>
          </html>`);
        return;
      }
      if (pathname === "/embedded-question-harness") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(`<!doctype html>
          <html lang="zh-CN">
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <link rel="stylesheet" href="/app/globals.css">
            </head>
            <body>
              <main class="workbench-content">
                <div class="math-interaction-frame">
                  <iframe
                    src="/interactive-lessons/sims/chapter1-shapes-world.html?section=shapes&amp;difficulty=advanced&amp;mode=challenge&amp;embedded=question&amp;challenge=solid-cube-parts"
                    title="正方体互动挑战"
                  ></iframe>
                </div>
              </main>
              <script type="module">
                import { observeIframeAutoHeight } from "/app/interactive-lessons/iframe-auto-height.mjs";
                const frame = document.querySelector(".math-interaction-frame iframe");
                observeIframeAutoHeight(frame, (height) => {
                  frame.style.height = height + "px";
                });
              </script>
            </body>
          </html>`);
        return;
      }
      if (pathname.startsWith("/interactive-lessons/")) {
        const candidate = path.resolve(publicRoot, `.${pathname}`);
        const publicPrefix = `${path.resolve(publicRoot)}${path.sep}`;
        if (!candidate.startsWith(publicPrefix)) {
          response.writeHead(403);
          response.end("Forbidden");
          return;
        }
        const extension = path.extname(candidate).toLowerCase();
        const contentTypes = {
          ".css": "text/css; charset=utf-8",
          ".gif": "image/gif",
          ".html": "text/html; charset=utf-8",
          ".jpeg": "image/jpeg",
          ".jpg": "image/jpeg",
          ".js": "text/javascript; charset=utf-8",
          ".mjs": "text/javascript; charset=utf-8",
          ".png": "image/png",
          ".svg": "image/svg+xml",
          ".webp": "image/webp",
        };
        await sendFile(response, candidate, contentTypes[extension] ?? "application/octet-stream");
        return;
      }
      response.writeHead(404);
      response.end("Not found");
    } catch (error) {
      response.writeHead(500);
      response.end(error instanceof Error ? error.message : "Unknown error");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("浏览器布局测试服务没有获得本地端口。");
  }

  const playwrightModule = await importInstalledPlaywright();
  const playwright = playwrightModule.default ?? playwrightModule;
  const browser = await playwright.chromium.launch({ headless: true });

  return {
    browser,
    origin: `http://127.0.0.1:${address.port}`,
    async close() {
      await browser.close();
      await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    },
  };
}
