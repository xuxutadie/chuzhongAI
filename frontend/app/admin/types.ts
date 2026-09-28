export type Account={id:number;username:string;display_name:string;role:'admin'|'teacher'|'student'|'parent'|'coach';grade:string|null;state:'active'|'disabled'|'deleted';revision:number;created_at:string};
export type Page<T>={items:T[];total:number;offset:number;limit:number};
export const roleLabels={admin:'管理员',teacher:'教师',student:'学生',parent:'家长',coach:'教练'};
export const stateLabels={active:'正常',disabled:'已停用',deleted:'已删除'};
export const actionLabels:Record<string,string>={create:'新增账号',edit:'编辑资料',update:'编辑资料','reset-password':'重置密码',disable:'停用',enable:'启用',delete:'删除',restore:'恢复','view-student':'查看学生','view-teacher':'查看教师','promote-admin':'升级管理员'};
