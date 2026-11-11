import {api,message} from './common.js';
import {summarizeLocalReport} from './monitor-model.mjs';

const $=id=>document.getElementById(id);
let adminToken='';let prepared=null;let rows=[];
const status=(id,text,type='')=>message($(id),text,type);
const aliasPattern=/^dispositivo-[a-z0-9][a-z0-9-]{0,30}$/;

function cell(tr, value){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}
function render(){
  const aliases=[...new Set(rows.map(r=>r.alias))].sort();
  const previous=$('device-filter').value;
  $('device-filter').replaceChildren(new Option('Todos',''),...aliases.map(a=>new Option(a,a)));
  $('device-filter').value=aliases.includes(previous)?previous:'';
  const filtered=rows.filter(r=>!$('device-filter').value||r.alias===$('device-filter').value);
  $('delete').disabled=!$('device-filter').value;
  $('count-devices').textContent=String(aliases.length);
  $('count-apps').textContent=String(new Set(rows.map(r=>r.package)).size);
  $('count-opens').textContent=String(rows.reduce((n,r)=>n+r.opens,0));
  const last=rows.reduce((n,r)=>Math.max(n,Number(r.uploadedAt||0)),0);
  $('latest-date').textContent=last?new Date(last).toLocaleString('pt-BR'):'—';
  $('rows').replaceChildren();
  if(!filtered.length){const tr=document.createElement('tr');const td=document.createElement('td');td.colSpan=4;td.textContent='Nenhum resumo encontrado.';tr.append(td);$('rows').append(tr);return;}
  for(const row of filtered){const tr=document.createElement('tr');cell(tr,row.alias);cell(tr,row.day);cell(tr,row.package);cell(tr,row.opens);$('rows').append(tr);}
}
async function refresh(){
  const data=await api('/v1/monitor/reports',{token:adminToken});
  rows=Array.isArray(data.rows)?data.rows:[];
  render();
}
$('login').addEventListener('click',async()=>{
  const token=$('token').value.trim();
  if(!token){status('login-status','Informe o token administrativo.','error');return;}
  $('login').disabled=true;
  try{
    const data=await api('/v1/monitor/reports',{token});
    adminToken=token;rows=data.rows||[];$('token').value='';
    $('login-section').hidden=true;$('dashboard').hidden=false;render();
  }catch(e){status('login-status',e.message,'error');$('login').disabled=false;}
});
$('preview').addEventListener('click',async()=>{
  prepared=null;$('submit').disabled=true;$('preview-area').hidden=true;
  const file=$('report-file').files?.[0],alias=$('device-alias').value.trim();
  if(!aliasPattern.test(alias)){status('import-status','Use um identificador genérico: dispositivo-01.','error');return;}
  if(!file||file.size>1024*1024){status('import-status','Selecione um JSON de até 1 MB.','error');return;}
  try{
    const input=JSON.parse(await file.text());
    const aggregated=summarizeLocalReport(input);
    if(!aggregated.summaries.length)throw new Error('Nenhuma abertura de aplicativo selecionado encontrada.');
    if(aggregated.summaries.length>128)throw new Error('Este relatório excede 128 resumos diários.');
    prepared={alias,...aggregated};
    $('preview-text').textContent=`${aggregated.summaries.length} combinações aplicativo/dia; ${aggregated.summaries.reduce((s,r)=>s+r.opens,0)} aberturas. Nenhum evento detalhado será enviado.`;
    $('preview-area').hidden=false;$('submit').disabled=false;
    status('import-status','Prévia gerada localmente. Confira antes de enviar.','success');
  }catch(e){status('import-status',e.message,'error');}
});
$('submit').addEventListener('click',async()=>{
  if(!prepared)return;
  $('submit').disabled=true;
  try{
    const r=await api('/v1/monitor/reports',{method:'POST',token:adminToken,body:prepared});
    status('import-status',`${r.inserted} resumos importados.`, 'success');prepared=null;
    await refresh();
  }catch(e){status('import-status',e.message,'error');$('submit').disabled=false;}
});
$('refresh').addEventListener('click',async()=>{
  try{await refresh();status('data-status','Registros atualizados.','success');}
  catch(e){status('data-status',e.message,'error');}
});
$('device-filter').addEventListener('change',render);
$('delete').addEventListener('click',async()=>{
  const alias=$('device-filter').value;
  if(!alias||!confirm(`Apagar permanentemente todos os resumos de ${alias}?`))return;
  try{await api(`/v1/monitor/reports/${encodeURIComponent(alias)}`,{method:'DELETE',token:adminToken});
    await refresh();status('data-status',`Registros de ${alias} excluídos.`,'success');}
  catch(e){status('data-status',e.message,'error');}
});
window.addEventListener('pagehide',()=>{adminToken='';});
