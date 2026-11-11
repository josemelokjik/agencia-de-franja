import {api,message} from './common.js';
const form=document.querySelector('#connect-form');
const pair=document.querySelector('#pair-code');
const rustdeskId=document.querySelector('#rustdesk-id');
const consent=document.querySelector('#consent');
const status=document.querySelector('#message');
const submit=document.querySelector('#submit');

document.querySelector('#paste-id').addEventListener('click',async()=>{
  try {
    if(!navigator.clipboard?.readText) throw new Error('A leitura automática não está disponível neste navegador. Use Colar no campo.');
    const value=(await navigator.clipboard.readText()).trim();
    if(!value) throw new Error('Área de transferência vazia. Copie primeiro o ID no RustDesk.');
    rustdeskId.value=value;
    message(status,'ID inserido. Confira antes de enviar.');
  } catch (error){ message(status,error.message,'error'); }
});
form.addEventListener('submit',async(event)=>{
  event.preventDefault();
  if(!consent.checked){message(status,'Marque a autorização para prosseguir.','error');return;}
  submit.disabled=true;
  message(status,'Transmitindo seu ID ao operador...');
  try{
    await api('/v1/join',{method:'POST',body:{code:pair.value,rustdeskId:rustdeskId.value,consent:true}});
    message(status,'ID recebido! Aguarde a solicitação de conexão no RustDesk e aprove somente se reconhecer o operador.','success');
    form.querySelectorAll('input').forEach(el=>el.disabled=true);
    submit.textContent='ID enviado com sucesso';
  }catch(error){message(status,error.message,'error');submit.disabled=false;}
});
