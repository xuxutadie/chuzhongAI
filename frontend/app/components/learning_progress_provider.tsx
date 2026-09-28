"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { initialTasks } from "../student-data";
import {
  completeTodayTask,
  CourseContextRequiredError,
  getTodayTasks,
  getWorkspaceState,
  removeWorkspaceEntry,
  saveWorkspaceState,
  setWorkspaceEntry,
  startTodayTask,
  type TaskCompletionEvidence,
  type StudentCourseContext,
  type TodayTask,
  type WorkspaceState,
} from "../student-api";
import {
  createDailyProgress,
  getCompletedTaskCount,
  getCompletionRate,
  getCurrentTaskId,
  getTaskAvailability,
  loadDailyProgress,
  saveDailyProgress,
  type DailyLearningProgress,
  type LearningProgressStorage,
  type TaskAvailability,
} from "../learning-progress";
import { useStudentSession } from "./student_session_provider";
import { createRequestGeneration } from "../async_generation_guard";

function getBrowserStorage(): LearningProgressStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getLocalDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fallbackTodayTasks(): TodayTask[] {
  return initialTasks.map((task) => ({
    id: task.id,
    subject: task.subject,
    title: task.title,
    objective: task.objective,
    learningHref: task.learningHref,
    growthEarned: 40,
    status: "not_started" as const,
    startedAt: null,
    completedAt: null,
    reflection: null,
    courseContext: null,
  }));
}

function toProgress(tasks: TodayTask[], dateKey: string, growthEarned: number): DailyLearningProgress {
  return {
    version: 1,
    dateKey,
    growthEarned,
    tasks: Object.fromEntries(tasks.map((task) => [task.id, {
      status: task.status,
      ...(task.startedAt ? { startedAt: task.startedAt } : {}),
      ...(task.completedAt ? { completedAt: task.completedAt } : {}),
      ...(task.reflection ? { reflection: task.reflection } : {}),
    }])),
  };
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "学习服务暂时不可用，请稍后重试。";
}

const EMPTY_DAILY_PROGRESS = createDailyProgress([], "");

type LearningProgressContextValue = {
  progress: DailyLearningProgress;
  tasks: TodayTask[];
  isReady: boolean;
  storageWarning: boolean;
  syncWarning: string | null;
  currentTaskId: string | null;
  completedCount: number;
  completionRate: number;
  workspaceState: WorkspaceState;
  isWorkspaceReady: boolean;
  workspaceWarning: string | null;
  /** 当前账号选择的真实课程；每日任务仍以各自冻结快照为准。 */
  courseContext: StudentCourseContext | null;
  /** 新账号尚未选择服务端已导入课程时为 true，页面应显示选择入口而非演示任务。 */
  courseContextRequired: boolean;
  /** 保存课程选择后重新读取服务端今日任务。 */
  refreshLearningData: () => Promise<boolean>;
  storageNamespace: string;
  getAvailability: (taskId: string) => TaskAvailability;
  /** 服务端确认任务确实进入“进行中”后才返回 true。 */
  startTask: (taskId: string) => Promise<boolean>;
  /** 服务端按可信答案重新判定后才返回 true。 */
  completeTask: (taskId: string, reflection: string, evidence: TaskCompletionEvidence) => Promise<boolean>;
  saveWorkspaceEntry: <T>(bucket: string, key: string, value: T) => Promise<boolean>;
  removeWorkspaceEntry: (bucket: string, key: string) => Promise<boolean>;
};

const LearningProgressContext = createContext<LearningProgressContextValue | null>(null);

export function LearningProgressProvider({ children }: { children: ReactNode }) {
  const { status: sessionStatus, user } = useStudentSession();
  const activeStudentId = user?.role === "student" ? user.id : null;
  const [progress, setProgress] = useState(() => createDailyProgress([], ""));
  const [tasks, setTasks] = useState<TodayTask[]>([]);
  const [loadedStudentId, setLoadedStudentId] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [storageWarning, setStorageWarning] = useState(false);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [workspaceState, setWorkspaceState] = useState<WorkspaceState>({});
  const [isWorkspaceReady, setIsWorkspaceReady] = useState(false);
  const [workspaceWarning, setWorkspaceWarning] = useState<string | null>(null);
  const [courseContext, setCourseContext] = useState<StudentCourseContext | null>(null);
  const [courseContextRequired, setCourseContextRequired] = useState(false);
  const progressRef = useRef(progress);
  const tasksRef = useRef(tasks);
  const workspaceRef = useRef(workspaceState);
  const storageRef = useRef<LearningProgressStorage | null>(null);
  const workspaceQueueRef = useRef(Promise.resolve(true));
  const loadGenerationRef = useRef(createRequestGeneration());
  const activeStudentIdRef = useRef<number | null>(activeStudentId);
  // 在账号状态刚变化、Effect 尚未运行前先更新 Ref，拦住旧回调的晚到写入。
  activeStudentIdRef.current = activeStudentId;
  const storageNamespace = activeStudentId ? `student-${activeStudentId}` : "";

  const isCurrentStudentRequest = useCallback((studentId: number, requestGeneration: number) => (
    activeStudentIdRef.current === studentId
    && loadGenerationRef.current.isCurrent(requestGeneration)
  ), []);

  const commitProgress = useCallback((next: DailyLearningProgress) => {
    progressRef.current = next;
    setProgress(next);
    const saved = saveDailyProgress(next, storageRef.current, storageNamespace);
    setStorageWarning(!saved);
  }, [storageNamespace]);

  const commitTasks = useCallback((nextTasks: TodayTask[], growthEarned: number, dateKey: string) => {
    tasksRef.current = nextTasks;
    setTasks(nextTasks);
    commitProgress(toProgress(nextTasks, dateKey, growthEarned));
  }, [commitProgress]);

  const refreshLearningData = useCallback(async () => {
    if (activeStudentId === null) return false;
    // 课程保存后让旧的“未选课”请求失效，避免它晚到又把页面切回课程门禁。
    const requestGeneration = loadGenerationRef.current.advance();
    const studentId = activeStudentId;
    const dateKey = getLocalDateKey();
    try {
      const remoteTasks = await getTodayTasks();
      if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
      commitTasks(remoteTasks.tasks, remoteTasks.growthEarned, remoteTasks.taskDate || dateKey);
      setCourseContext(remoteTasks.courseContext);
      setCourseContextRequired(false);
      setSyncWarning(null);
      return true;
    } catch (error) {
      if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
      if (error instanceof CourseContextRequiredError) {
        const emptyProgress = createDailyProgress([], "");
        tasksRef.current = [];
        progressRef.current = emptyProgress;
        setTasks([]);
        setProgress(emptyProgress);
        setCourseContext(null);
        setCourseContextRequired(true);
        setSyncWarning(null);
      } else {
        setSyncWarning(`今天的任务暂时无法更新：${messageFromError(error)}`);
      }
      return false;
    }
  }, [activeStudentId, commitTasks, isCurrentStudentRequest]);

  useEffect(() => {
    const requestGeneration = loadGenerationRef.current.advance();
    const emptyProgress = createDailyProgress([], "");
    let cancelled = false;
    const isCurrentRequest = () => (
      !cancelled
      && activeStudentId !== null
      && isCurrentStudentRequest(activeStudentId, requestGeneration)
    );

    // 账号切换时先同步清空所有内存状态，并让旧队列失效。
    // 这样 A 的任务、进度或草稿不会在 B 的首屏短暂出现。
    tasksRef.current = [];
    progressRef.current = emptyProgress;
    workspaceRef.current = {};
    storageRef.current = null;
    workspaceQueueRef.current = Promise.resolve(true);
    setTasks([]);
    setProgress(emptyProgress);
    setWorkspaceState({});
    setLoadedStudentId(null);
    setIsReady(false);
    setIsWorkspaceReady(false);
    setStorageWarning(false);
    setSyncWarning(null);
    setWorkspaceWarning(null);
    setCourseContext(null);
    setCourseContextRequired(false);

    if (sessionStatus === "loading") return () => {
      cancelled = true;
    };
    if (activeStudentId === null) {
      setIsReady(true);
      setIsWorkspaceReady(true);
      return () => {
        cancelled = true;
      };
    }

    const storage = getBrowserStorage();
    const dateKey = getLocalDateKey();
    storageRef.current = storage;
    setStorageWarning(storage === null);

    void Promise.allSettled([getTodayTasks(), getWorkspaceState()]).then(([tasksResult, workspaceResult]) => {
      if (!isCurrentRequest()) return;

      if (tasksResult.status === "fulfilled") {
        const remoteTasks = tasksResult.value;
        commitTasks(remoteTasks.tasks, remoteTasks.growthEarned, remoteTasks.taskDate || dateKey);
        setCourseContext(remoteTasks.courseContext);
        setCourseContextRequired(false);
      } else if (tasksResult.reason instanceof CourseContextRequiredError) {
        // 新学生还没选真实课程时，绝不能拿内置演示任务冒充今天已安排的内容。
        tasksRef.current = [];
        setTasks([]);
        progressRef.current = emptyProgress;
        setProgress(emptyProgress);
        setCourseContext(null);
        setCourseContextRequired(true);
        setSyncWarning(null);
      } else {
        const localTasks = fallbackTodayTasks();
        const localProgress = loadDailyProgress(
          localTasks.map((task) => task.id),
          dateKey,
          storage,
          `student-${activeStudentId}`,
        );
        const restoredTasks = localTasks.map((task) => ({
          ...task,
          status: localProgress.tasks[task.id]?.status ?? task.status,
          startedAt: localProgress.tasks[task.id]?.startedAt ?? null,
          completedAt: localProgress.tasks[task.id]?.completedAt ?? null,
          reflection: localProgress.tasks[task.id]?.reflection ?? null,
        }));
        tasksRef.current = restoredTasks;
        setTasks(restoredTasks);
        progressRef.current = localProgress;
        setProgress(localProgress);
        setSyncWarning(`尚未连接学习服务：${messageFromError(tasksResult.reason)}。可继续查看本机草稿，但完成记录需在服务恢复后提交。`);
      }

      if (workspaceResult.status === "fulfilled") {
        workspaceRef.current = workspaceResult.value;
        setWorkspaceState(workspaceResult.value);
      } else {
        workspaceRef.current = {};
        setWorkspaceState({});
        setWorkspaceWarning("服务端草稿暂不可读取，正在使用本机备用草稿。");
      }
      setLoadedStudentId(activeStudentId);
      setIsReady(true);
      setIsWorkspaceReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [activeStudentId, commitTasks, isCurrentStudentRequest, sessionStatus]);

  const updateRemoteTask = useCallback((updatedTask: TodayTask) => {
    const nextTasks = tasksRef.current.map((task) => task.id === updatedTask.id ? updatedTask : task);
    const nextGrowth = nextTasks
      .filter((task) => task.status === "completed")
      .reduce((total, task) => total + task.growthEarned, 0);
    commitTasks(nextTasks, nextGrowth, progressRef.current.dateKey || getLocalDateKey());
  }, [commitTasks]);

  const startTask = useCallback(async (taskId: string) => {
    if (!user || user.role !== "student") return false;
    const studentId = user.id;
    const requestGeneration = loadGenerationRef.current.current();
    if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
    try {
      const task = await startTodayTask(taskId);
      if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
      if (!task) throw new Error("没有找到今天的学习任务");
      updateRemoteTask(task);
      setSyncWarning(null);
      return task.status === "in_progress" || task.status === "completed";
    } catch (error) {
      if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
      setSyncWarning(messageFromError(error));
      return false;
    }
  }, [isCurrentStudentRequest, updateRemoteTask, user]);

  const completeTask = useCallback(async (
    taskId: string,
    reflection: string,
    evidence: TaskCompletionEvidence,
  ) => {
    if (!user || user.role !== "student") return false;
    const studentId = user.id;
    const requestGeneration = loadGenerationRef.current.current();
    if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
    try {
      const result = await completeTodayTask(taskId, reflection, evidence);
      if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
      if (!result.task) throw new Error("没有找到今天的学习任务");
      updateRemoteTask(result.task);
      setSyncWarning(null);
      return result.task.status === "completed";
    } catch (error) {
      if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
      setSyncWarning(messageFromError(error));
      return false;
    }
  }, [isCurrentStudentRequest, updateRemoteTask, user]);

  const saveWorkspaceEntry = useCallback(async <T,>(bucket: string, key: string, value: T) => {
    if (!user || user.role !== "student") return false;
    const studentId = user.id;
    const requestGeneration = loadGenerationRef.current.current();
    if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
    const next = setWorkspaceEntry(workspaceRef.current, bucket, key, value);
    workspaceRef.current = next;
    setWorkspaceState(next);
    const persist = async () => {
      if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
      try {
        await saveWorkspaceState(next);
        if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
        setWorkspaceWarning(null);
        return true;
      } catch (error) {
        if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
        setWorkspaceWarning(`草稿暂未同步到服务器：${messageFromError(error)}`);
        return false;
      }
    };
    workspaceQueueRef.current = workspaceQueueRef.current.then(persist, persist);
    return workspaceQueueRef.current;
  }, [isCurrentStudentRequest, user]);

  const removeWorkspaceEntryFromServer = useCallback(async (bucket: string, key: string) => {
    if (!user || user.role !== "student") return false;
    const studentId = user.id;
    const requestGeneration = loadGenerationRef.current.current();
    if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
    const next = removeWorkspaceEntry(workspaceRef.current, bucket, key);
    workspaceRef.current = next;
    setWorkspaceState(next);
    const persist = async () => {
      if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
      try {
        await saveWorkspaceState(next);
        if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
        setWorkspaceWarning(null);
        return true;
      } catch (error) {
        if (!isCurrentStudentRequest(studentId, requestGeneration)) return false;
        setWorkspaceWarning(`草稿暂未同步到服务器：${messageFromError(error)}`);
        return false;
      }
    };
    workspaceQueueRef.current = workspaceQueueRef.current.then(persist, persist);
    return workspaceQueueRef.current;
  }, [isCurrentStudentRequest, user]);

  // 用户对象先更新、异步任务后返回时，视图只读取与当前学生 ID 对应的数据。
  // 这层门禁让 Effect 执行前的单次渲染也不会泄露上一位学生的任务。
  const studentDataIsCurrent = (
    sessionStatus === "authenticated"
    && activeStudentId !== null
    && loadedStudentId === activeStudentId
  );
  const visibleTasks = studentDataIsCurrent ? tasks : [];
  const visibleProgress = studentDataIsCurrent ? progress : EMPTY_DAILY_PROGRESS;
  const visibleWorkspaceState = studentDataIsCurrent ? workspaceState : {};
  const visibleIsReady = activeStudentId === null
    ? sessionStatus !== "loading" && isReady
    : studentDataIsCurrent && isReady;
  const visibleWorkspaceReady = activeStudentId === null
    ? sessionStatus !== "loading" && isWorkspaceReady
    : studentDataIsCurrent && isWorkspaceReady;
  const taskIds = visibleTasks.map((task) => task.id);
  const value = useMemo<LearningProgressContextValue>(() => ({
    progress: visibleProgress,
    tasks: visibleTasks,
    isReady: visibleIsReady,
    storageWarning: studentDataIsCurrent ? storageWarning : false,
    syncWarning: studentDataIsCurrent ? syncWarning : null,
    currentTaskId: getCurrentTaskId(visibleProgress, taskIds),
    completedCount: getCompletedTaskCount(visibleProgress, taskIds),
    completionRate: getCompletionRate(visibleProgress, taskIds),
    workspaceState: visibleWorkspaceState,
    isWorkspaceReady: visibleWorkspaceReady,
    workspaceWarning: studentDataIsCurrent ? workspaceWarning : null,
    courseContext: studentDataIsCurrent ? courseContext : null,
    courseContextRequired: studentDataIsCurrent && courseContextRequired,
    refreshLearningData,
    storageNamespace,
    getAvailability: (taskId) => getTaskAvailability(visibleProgress, taskIds, taskId),
    startTask,
    completeTask,
    saveWorkspaceEntry,
    removeWorkspaceEntry: removeWorkspaceEntryFromServer,
  }), [completeTask, courseContext, courseContextRequired, refreshLearningData, removeWorkspaceEntryFromServer, saveWorkspaceEntry, startTask, storageNamespace, storageWarning, studentDataIsCurrent, syncWarning, taskIds, visibleIsReady, visibleProgress, visibleTasks, visibleWorkspaceReady, visibleWorkspaceState, workspaceWarning]);

  return <LearningProgressContext.Provider value={value}>{children}</LearningProgressContext.Provider>;
}

export function useLearningProgress() {
  const context = useContext(LearningProgressContext);
  if (!context) {
    throw new Error("useLearningProgress 必须在 LearningProgressProvider 内使用");
  }
  return context;
}
