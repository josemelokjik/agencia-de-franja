import {api,message,copyText} from './common.js';
const $=id=>document.getElementById(id);
let adminToken=''; let activeCode=''; let session=null; let pollTimer=null;
const pageLink = new URL('./',location.href).toString();
$('public-link').value=pageLink;
function setStatus(state,desc='') {
  $('state-label').textContent = ({waiting:'Aguardando celular',ready:'ID recebido',idle:'Sem sessão ativa',offline:'Não conectado'})[state] || state;
  $('state-description').textContent = desc;
  $('status-dot').className='status-indicator '+(state==='ready'?'active':state==='waiting'?'waiting':'');
}
function render() {
  const ready=session?.state==='ready';const waiting=session?.state==='waiting';
  $('create').disabled=!adminToken||Boolean(session);
  $('close').disabled=!adminToken||!session;
  $('refresh').disabled=!adminToken;
  $('code-section').classList.toggle('hidden',!waiting||!activeCode);
  if(activeCode) $('pair-code').textContent=activeCode;
  $('ready-section').classList.toggle('hidden',!ready);
  $('waiting-message').classList.toggle('hidden',ready);
  $('remote-id').textContent = ready ? session.rustdeskId : '—';
  $('waiting-message').textContent = waiting ? 'A pessoa ainda não enviou o ID. Compartilhe o link fixo e o código temporário.' : 'Nenhuma identificação recebida. Crie uma solicitação para começar.';
  const expires=session?.expiresAt ? `Expira às ${new Date(session.expiresAt).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}.` : '';
  setStatus(ready?'ready':waiting?'waiting':'idle',expires);
}
async function refresh(){
  if(!adminToken)return;
  try{const out=await api('/v1/session',{token:adminToken});session=out.session;if(!session)activeCode='';render();}
  catch(error){message($('panel-message'),error.message,'error');}
}
$('login').addEventListener('click',async()=>{
  const token=$('admin-token').value.trim();
  if(!token){message($('login-status'),'Informe seu token privado.','error');return;}
  try{
    const data=await api('/v1/session',{token});
    adminToken=token;session=data.session;
    $('admin-token').value='';$('admin-token').disabled=true;$('login').disabled=true;
    message($('login-status'),'Autenticado. Token mantido apenas na memória do navegador.','success');
    render();if(pollTimer)clearInterval(pollTimer);pollTimer=setInterval(()=>{if(!document.hidden)void refresh();},4000);
  }catch(error){message($('login-status'),error.message,'error');}
});
$('create').addEventListener('click',async()=>{
  $('create').disabled=true;
  try{const res=await api('/v1/session',{method:'POST',token:adminToken});session=res.session;activeCode=res.code;render();message($('panel-message'),'Atendimento criado. Envie o link e o código ao usuário.','success');}
  catch(error){message($('panel-message'),error.message,'error');$('create').disabled=false;}
});
$('refresh').addEventListener('click',refresh);
$('close').addEventListener('click',async()=>{
  if(!confirm('Encerrar a solicitação? Isso apaga o ID do painel, mas não encerra automaticamente uma sessão RustDesk já estabelecida.'))return;
  try{await api('/v1/session/close',{method:'POST',token:adminToken});session=null;activeCode='';render();message($('panel-message'),'Solicitação encerrada. Termine também a sessão no RustDesk, se estiver aberta.','success');}
  catch(error){message($('panel-message'),error.message,'error');}
});
$('copy-link').addEventListener('click',async()=>{try{await copyText(pageLink);message($('panel-message'),'Link copiado.','success');}catch(e){message($('panel-message'),e.message,'error');}});
$('copy-code').addEventListener('click',async()=>{try{await copyText(activeCode);message($('panel-message'),'Código copiado.','success');}catch(e){message($('panel-message'),e.message,'error');}});
$('copy-id').addEventListener('click',async()=>{try{await copyText(session.rustdeskId);message($('panel-message'),'ID copiado. Cole no RustDesk para solicitar acesso.','success');}catch(e){message($('panel-message'),e.message,'error');}});
window.addEventListener('pagehide',()=>{adminToken='';});
setStatus('offline');
