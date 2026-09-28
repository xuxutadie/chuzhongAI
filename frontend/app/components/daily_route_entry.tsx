"use client";
import { useStudentSession } from './student_session_provider';
import { DailyRouteWorkspace } from './daily_route_workspace';
export function DailyRouteEntry({step}:{step:number}){
  const {user}=useStudentSession();
  return <DailyRouteWorkspace key={`${user?.id}:${step}`} step={step}/>;
}
