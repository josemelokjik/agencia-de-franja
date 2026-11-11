import {D1MonitorStore} from './monitor-storage.mjs';

const ALIAS=/^dispositivo-[a-z0-9][a-z0-9-]{0,30}$/;
const PACKAGE=/^(?:[A-Za-z][A-Za-z0-9_]*\.)+[A-Za-z][A-Za-z0-9_]*$/;
const MS_DAY=86400000;
const RETENTION_DAYS=30;
function strictObject(value,keys){
  return value && typeof value==='object' && !Array.isArray(value)
    && Object.keys(value).every(k=>keys.includes(k));
}
function validDay(day){
  return typeof day==='string' && /^\d{4}-\d{2}-\d{2}$/.test(day)
    && !Number.isNaN(Date.parse(day+'T00:00:00Z'))
    && new Date(day+'T00:00:00Z').toISOString().slice(0,10)===day;
}
export function validateSummary(payload,now){
  if(!strictObject(payload,['alias','generatedAt','summaries'])) throw new Error('Campos não permitidos.');
  if(typeof payload.alias!=='string'||!ALIAS.test(payload.alias)) throw new Error('Identificador de dispositivo inválido. Use dispositivo-01.');
  const generated=Date.parse(payload.generatedAt);
  if(typeof payload.generatedAt!=='string'||!Number.isFinite(generated)||generated>now+MS_DAY||generated<now-RETENTION_DAYS*MS_DAY)
    throw new Error('Data de geração fora do período.');
  if(!Array.isArray(payload.summaries)||payload.summaries.length<1||payload.summaries.length>128)
    throw new Error('Informe 1 a 128 resumos diários.');
  const unique=new Set();
  for(const r of payload.summaries){
    if(!strictObject(r,['day','package','opens'])) throw new Error('Campos não permitidos nas métricas.');
    if(!validDay(r.day)||Date.parse(r.day+'T00:00:00Z')<now-RETENTION_DAYS*MS_DAY
      || Date.parse(r.day+'T00:00:00Z')>now+MS_DAY)
      throw new Error('Dia fora do período permitido.');
    if(typeof r.package!=='string'||r.package.length>150||!PACKAGE.test(r.package))
      throw new Error('Nome de aplicativo inválido.');
    if(!Number.isSafeInteger(r.opens)||r.opens<0||r.opens>10000)
      throw new Error('Quantidade de aberturas inválida.');
    const key=r.day+'|'+r.package;
    if(unique.has(key)) throw new Error('Duplicação de aplicativo/dia.');
    unique.add(key);
  }
  return {alias:payload.alias,generatedAt:payload.generatedAt,summaries:payload.summaries};
}
async function bodyJson(request){
  if(!request.headers.get('Content-Type')?.startsWith('application/json')) return null;
  const length=Number(request.headers.get('Content-Length')||0);
  if(length>36000) return null;
  const raw=await request.text();
  if(raw.length>36000) return null;
  try{return JSON.parse(raw);}catch{return null;}
}
// Rotas isoladas: não se conectam ao agente Android, não recebem dados de tela nem eventos brutos.
export async function handleMonitorRoute(request,env,origin,path,ctx){
  const {validAdmin,respond,now=Date.now()}=ctx;
  if(!await validAdmin(request,env)) return respond({error:'Não autorizado.'},401,origin);
  if(!env.MONITOR_STORE&&!env.DB) return respond({error:'Banco de relatórios não configurado.'},503,origin);
  const store=env.MONITOR_STORE||new D1MonitorStore(env.DB);
  if(path==='/v1/monitor/reports'&&request.method==='GET'){
    const rows=await store.list();
    return respond({rows,mode:'importacao-manual',retentionDays:RETENTION_DAYS},200,origin);
  }
  if(path==='/v1/monitor/reports'&&request.method==='POST'){
    const raw=await bodyJson(request);
    let payload;
    try{payload=validateSummary(raw,now);}catch(e){return respond({error:e.message},422,origin);}
    const inserted=await store.upsert(payload.alias,payload.summaries,now);
    return respond({inserted,mode:'resumos-diarios'},201,origin);
  }
  if(path.startsWith('/v1/monitor/reports/')&&request.method==='DELETE'){
    let alias;
    try{alias=decodeURIComponent(path.slice('/v1/monitor/reports/'.length));}
    catch{return respond({error:'Identificador inválido.'},422,origin);}
    if(!ALIAS.test(alias)) return respond({error:'Identificador inválido.'},422,origin);
    const deleted=await store.deleteAlias(alias);
    return respond({deleted},200,origin);
  }
  return respond({error:'Rota não encontrada.'},404,origin);
}
