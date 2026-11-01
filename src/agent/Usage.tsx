import {useEffect} from 'react';
import {UsageSummary} from '@edukors/ai-ui';
import {useAgent} from './store';
import {useUiLang} from '../i18n';
export function Usage({compact=false}:{compact?:boolean}){
 const {usage,usageState,capabilities,loadUsage,accountId}=useAgent(),lang=useUiLang();
 useEffect(()=>{void loadUsage();},[loadUsage,accountId]);
 if(compact)return null;
 return <UsageSummary lang={lang} usage={usage?{observedAt:new Date(usage.at).toISOString(),windows:usage.limits?.map(w=>({name:w.window==='5h'?'five_hour':w.window==='weekly'?'seven_day':w.window,used:w.percent/100,resetsAt:w.resetsAt?new Date(w.resetsAt).toISOString():undefined}))}:null} onRefresh={capabilities?.usage?()=>void loadUsage(true):undefined} loading={usageState==='loading'} error={usageState==='error'}/>;
}
