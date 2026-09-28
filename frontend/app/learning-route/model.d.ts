import type { LearningRoute } from './types';
export const STEP_TITLES:string[];
export const STAGE_LABELS:Record<string,string>;
export function routeCards(route:LearningRoute|null):Array<{step:number;title:string;status:string;disabled:boolean;action:string;reason:string}>;
