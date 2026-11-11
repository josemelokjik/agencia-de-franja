import test from 'node:test';
import assert from 'node:assert/strict';
import {handleMonitorRoute,validateSummary} from '../src/monitor-core.mjs';

const TOKEN='token-private-large-test-567890';
class MemoryMonitorStore {
  constructor(){this.rows=[];}
  async upsert(alias, summaries,at){
    for(const s of summaries){const index=this.rows.findIndex(r=>r.alias===alias&&r.day===s.day&&r.package===s.package);
      const row={...s,alias,uploadedAt:at};if(index>=0)this.rows[index]=row;else this.rows.push(row);}
    return summaries.length;
  }
  async list(){return [...this.rows].sort((a,b)=>b.day.localeCompare(a.day));}
  async deleteAlias(alias){const n=this.rows.length;this.rows=this.rows.filter(r=>r.alias!==alias);return n-this.rows.length;}
}
const store=new MemoryMonitorStore();
const respond=(data,status)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const authenticate=async(req)=>req.headers.get('Authorization')==='Bearer '+TOKEN;
async function call(path,{method='GET',body=null,token=TOKEN,extra=null}={}){
  const req=new Request('https://example.test'+path,{method,
    headers:{...(token?{Authorization:`Bearer ${token}`}:{}),...(body?{'Content-Type':'application/json'}:{})},
    body:body?JSON.stringify(body):null});
  const r=await handleMonitorRoute(req,{MONITOR_STORE:store},null,new URL(req.url).pathname,
    {validAdmin:authenticate,respond,now:Date.parse('2026-11-11T17:00:00Z')});
  return {status:r.status,payload:await r.json()};
}
const summary={alias:'dispositivo-01',generatedAt:'2026-11-11T12:00:00Z',summaries:[{day:'2026-11-10',package:'br.com.empresa.app',opens:2}]};
test('recusa leitura e gravação sem autenticação administrativa', async()=>{
  assert.equal((await call('/v1/monitor/reports',{token:null})).status,401);
  assert.equal((await call('/v1/monitor/reports',{method:'POST',body:summary,token:null})).status,401);
});
test('recusa campos proibidos e dados brutos',()=>{
  assert.throws(()=>validateSummary({...summary,screenContent:'texto'},Date.parse('2026-11-11T17:00:00Z')),/Campos/);
  assert.throws(()=>validateSummary({...summary,summaries:[{...summary.summaries[0],events:['OPEN']}]},Date.parse('2026-11-11T17:00:00Z')),/Campos/);
});
test('exige totais diários válidos, atuais e limitados',()=>{
  assert.throws(()=>validateSummary({...summary,summaries:[{...summary.summaries[0],opens:-1}]},Date.parse('2026-11-11T17:00:00Z')),/aberturas/);
  assert.throws(()=>validateSummary({...summary,summaries:[{...summary.summaries[0],day:'2020-01-01'}]},Date.parse('2026-11-11T17:00:00Z')),/período/);
  assert.throws(()=>validateSummary({...summary,alias:'endereço@email.com'},Date.parse('2026-11-11T17:00:00Z')),/[Ii]dentificador/);
});
test('salva somente resumos e permite consulta remota autenticada',async()=>{
  const save=await call('/v1/monitor/reports',{method:'POST',body:summary});
  assert.equal(save.status,201);assert.equal(save.payload.inserted,1);
  const list=await call('/v1/monitor/reports');
  assert.equal(list.status,200);assert.deepEqual(list.payload.rows[0].package,'br.com.empresa.app');
  assert.equal(list.payload.rows[0].opens,2);
});
test('uma segunda importação é idempotente e a exclusão é administrativa',async()=>{
  assert.equal((await call('/v1/monitor/reports',{method:'POST',body:summary})).status,201);
  assert.equal((await call('/v1/monitor/reports')).payload.rows.length,1);
  assert.equal((await call('/v1/monitor/reports/dispositivo-01',{method:'DELETE',token:null})).status,401);
  assert.equal((await call('/v1/monitor/reports/dispositivo-01',{method:'DELETE'})).status,200);
  assert.deepEqual((await call('/v1/monitor/reports')).payload.rows,[]);
});
