import configuration from "../../shared/subject-visibility.json" with { type: "json" };

/** 暂时隐藏学科只影响入口和新任务，不删除课程文件或历史数据。 */
export function isSubjectEnabled(subject) {
  return configuration.enabledSubjects.includes(subject);
}

export function isHiddenSubjectPath(path) {
  return (!isSubjectEnabled("英语") && /^\/(subjects\/english|tasks\/english)(\/|-|$)/.test(path)) ||
    (!isSubjectEnabled("语文") && /^\/(subjects\/chinese|tasks\/chinese)(\/|-|$)/.test(path));
}
