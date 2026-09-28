import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 隔离验收/生产构建，避免覆盖正在运行的开发输出。
  distDir: /^\.next(?:-[a-z0-9-]+)?$/.test(process.env.NEXT_DIST_DIR || "") ? process.env.NEXT_DIST_DIR : ".next",
  reactStrictMode: true
};

export default nextConfig;
