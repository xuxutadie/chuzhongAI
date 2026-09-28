'use client';
import {useEffect,useState} from 'react';
import {educationRequest} from './api';
export function useEducationResource<T>(path:string,scoped=false,revision=0){
  const [data,setData]=useState<T|null>(null),[error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();setData(null);setError('');
    educationRequest<T>(path,{signal:controller.signal},scoped).then(value=>{if(!controller.signal.aborted)setData(value);})
      .catch(reason=>{if(!controller.signal.aborted)setError(reason.message);});
    return()=>controller.abort();
  },[path,scoped,revision]);
  return {data,error};
}
