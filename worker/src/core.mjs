import { D1SessionStore } from './storage.mjs';
import {handleMonitorRoute} from './monitor-core.mjs';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const TTL_MS = 20 * 60 * 1000;
const encoder = new TextEncoder();

export function normalizeCode(input) {
  return typeof input === 'string' ? input.replace(/[\s-]/g, '').toUpperCase() : '';
}
export function validRustDeskId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.@ -]{4,64}$/.test(value) && value.trim().length >= 4;
}
function sanitizeId(value) { return value.replace(/\s+/g, '').trim(); }
function code() {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  const value = [...bytes].map(b => CODE_ALPHABET[b % 32]).join('');
  return `${value.slice(0,5)}-${value.slice(5)}`;
}
async function hash(value) {
  const bytes = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(bytes), x=>x.toString(16).padStart(2,'0')).join('');
}
async function validAdmin(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!env.ADMIN_TOKEN || token.length < 16) return false;
  // Compara resumos de tamanho fixo para evitar comparações variáveis de token.
  const a = await hash(token);
  const b = await hash(env.ADMIN_TOKEN);
  let difference = 0;
  for (let i=0; i<a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function respond(data,status, origin) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Vary': 'Origin',
  };
  if(origin) headers['Access-Control-Allow-Origin'] = origin;
  return new Response(data===null ? null : JSON.stringify(data), {status, headers});
}
async function getBody(req) {
  if (!req.headers.get('Content-Type')?.startsWith('application/json')) return null;
  const length = Number(req.headers.get('Content-Length') || 0);
  if (length > 2048) return null;
  const data = await req.text();
  if (data.length > 2048) return null;
  try { const value = JSON.parse(data); return value && typeof value === 'object' && !Array.isArray(value) ? value : null; }
  catch { return null; }
}
export async function handleRequest(request, env) {
  const origin = request.headers.get('Origin');
  const allowedOrigins = (env.ALLOWED_ORIGIN || '').split(',').map(v=>v.trim()).filter(Boolean);
  if (origin && !allowedOrigins.includes(origin)) return respond({error:'Origem não autorizada.'}, 403, null);
  if (request.method === 'OPTIONS') return respond(null, 204, origin);
  const path = new URL(request.url).pathname.replace(/\/$/,'') || '/';
  if (path==='/v1/health' && request.method === 'GET') return respond({status:'ok'}, 200, origin);
  if (path.startsWith('/v1/monitor/')) return handleMonitorRoute(request,env,origin,path,{validAdmin,respond});
  if (!env.STORE && !env.DB) return respond({error:'Banco de dados não configurado.'},503,origin);
  const storage = env.STORE || new D1SessionStore(env.DB);
  const now = Date.now();
  const operatorRoute = path === '/v1/session' || path === '/v1/session/close';
  if(operatorRoute && !await validAdmin(request,env)) return respond({error:'Não autorizado.'},401,origin);
  if (path==='/v1/session' && request.method==='POST') {
    const plainCode = code();
    const entry = {sessionId:crypto.randomUUID(), hash:await hash(normalizeCode(plainCode)), createdAt:now, expiresAt:now+TTL_MS};
    const success = await storage.create(entry);
    if (!success) return respond({error:'Já existe uma sessão ativa. Encerre-a ou aguarde a expiração.'},409,origin);
    return respond({session:{sessionId:entry.sessionId,state:'waiting',expiresAt:entry.expiresAt},code:plainCode},201,origin);
  }
  if (path==='/v1/session' && request.method==='GET') {
    const row = await storage.get(now);
    const session = row ? {sessionId:row.sessionId,state:row.state,rustdeskId:row.rustdeskId,expiresAt:row.expiresAt,consentedAt:row.consentedAt} : null;
    return respond({session},200,origin);
  }
  if(path==='/v1/session/close' && request.method==='POST') {
    await storage.close();
    return respond({closed:true},200,origin);
  }
  if(path==='/v1/join' && request.method==='POST') {
    const payload=await getBody(request);
    if (!payload || payload.consent !== true || Object.keys(payload).some(key => !['code','rustdeskId','consent'].includes(key)))
      return respond({error:'Informe consentimento explícito, código e ID, sem senha.'},422,origin);
    const pairing = normalizeCode(payload.code);
    if (!new RegExp(`^[${CODE_ALPHABET}]{10}$`).test(pairing) || !validRustDeskId(payload.rustdeskId))
      return respond({error:'Código ou ID RustDesk inválido.'},422,origin);
    const ok = await storage.submit(await hash(pairing),sanitizeId(payload.rustdeskId),now);
    if (!ok) return respond({error:'Código incorreto, expirado ou já utilizado.'},404,origin);
    return respond({registered:true},200,origin);
  }
  return respond({error:'Rota não encontrada.'},404,origin);
}
