export function apiBase() {
  const raw = String(window.APP_CONFIG?.apiBase || '').trim().replace(/\/+$/,'');
  if (!raw || !/^https:\/\/[a-z\d.-]+(?::\d+)?$/i.test(raw)) {
    throw new Error('API ainda não configurada. Defina apiBase HTTPS no arquivo config.js.');
  }
  return raw;
}
export async function api(path,{method='GET',token='',body}={}) {
  const headers={'Accept':'application/json'};
  if (body) headers['Content-Type']='application/json';
  if (token) headers['Authorization']=`Bearer ${token}`;
  let response;
  try { response=await fetch(`${apiBase()}${path}`,{method,headers,body:body?JSON.stringify(body):undefined,cache:'no-store'}); }
  catch(e) { if(e.message.includes('não configurada')) throw e; throw new Error('Não foi possível acessar o servidor. Verifique conexão e configuração de origem (CORS).'); }
  const payload = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload.error || `Falha HTTP ${response.status}`);
  return payload;
}
export function message(el,text,type='') { el.textContent=text; el.className=`message ${type}`; }
export async function copyText(value) { if(!navigator.clipboard?.writeText) throw new Error('Copie manualmente: área de transferência indisponível.'); await navigator.clipboard.writeText(value); }
