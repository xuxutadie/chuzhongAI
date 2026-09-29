import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // 隔离验收/生产构建，避免覆盖正在运行的开发输出。
  distDir: /^\.next(?:-[a-z0-9-]+)?$/.test(process.env.NEXT_DIST_DIR || "") ? process.env.NEXT_DIST_DIR : ".next",
  reactStrictMode: true,
  ...(process.env.NEXT_STANDALONE === "1" ? {
    output: "standalone" as const,
    outputFileTracingRoot: path.resolve(process.cwd(), ".."),
    // 云端小型机器串行生成页面，降低构建时内存峰值。
    experimental: { cpus: 1 },
  } : {})
};

export default nextConfig;
