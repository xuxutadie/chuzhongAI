import { redirect } from "next/navigation";

// 兼容旧入口，任务始终由学习首页的五步路线统一呈现。
export default function TasksPage() {
  redirect("/dashboard");
}
