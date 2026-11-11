import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRequest, normalizeCode, validRustDeskId} from '../src/core.mjs';

class MemoryStore {
  constructor() { this.record = null; }
  async create(x) {
    if (this.record && this.record.state !== 'closed' && this.record.expiresAt > x.createdAt) return false;
    this.record = { ...x, state: 'waiting', rustdeskId: null, consentedAt: null };
    return true;
  }
  async get(now) {
    if (!this.record || this.record.expiresAt <= now || this.record.state === 'closed') return null;
    return this.record;
  }
  async submit(hash, id, now) {
    if (!this.record || this.record.hash !== hash || this.record.state !== 'waiting' || this.record.expiresAt <= now) return false;
    this.record = { ...this.record, rustdeskId: id, consentedAt: now, state: 'ready' };
    return true;
  }
  async close() {
    if (!this.record || this.record.state === 'closed') return false;
    this.record = { ...this.record, hash: '', rustdeskId: null, state: 'closed' };
    return true;
  }
}
const origin = 'https://example.github.io';
const env = () => ({ ALLOWED_ORIGIN: origin, ADMIN_TOKEN: 'long-admin-token-keep-private', STORE: new MemoryStore() });
const req = (path, { method='GET', token=null, body=null, requestOrigin=origin }={}) => new Request('https://api.example.workers.dev'+path, {
  method,
  headers: { 'origin': requestOrigin, ...(token ? {'Authorization':`Bearer ${token}`} : {}), ...(body ? {'Content-Type':'application/json'} : {}) },
  body: body ? JSON.stringify(body) : null,
});
const call = async (e, path, opts={}) => { const r = await handleRequest(req(path,opts), e); return {status:r.status, data: await r.json(), headers:r.headers}; };
const admin = 'long-admin-token-keep-private';

test('normalização e validação permitem um ID RustDesk, não uma URL',()=>{
  assert.equal(normalizeCode(' AbcdE-fGhiJ '), 'ABCDEFGHIJ');
  assert.equal(validRustDeskId('123 456 789'), true);
  assert.equal(validRustDeskId('something@example'), true);
  assert.equal(validRustDeskId('https://evil.invalid'), false);
});
test('não expõe uma sessão sem autorização de operador', async()=>{
  const e=env();
  const response = await call(e,'/v1/session');
  assert.equal(response.status,401);
});
test('origem não autorizada é rejeitada', async()=>{
  const e=env();
  const response = await call(e,'/v1/health',{requestOrigin:'https://untrusted.invalid'});
  assert.equal(response.status,403);
});
test('operador cria uma sessão e não cria outra simultânea', async()=>{
  const e=env();
  const first = await call(e,'/v1/session',{method:'POST',token:admin});
  assert.equal(first.status,201);
  assert.match(first.data.code,/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  const second = await call(e,'/v1/session',{method:'POST',token:admin});
  assert.equal(second.status,409);
  const status = await call(e,'/v1/session',{token:admin});
  assert.equal(status.data.session.state,'waiting');
  assert.equal(JSON.stringify(status.data).includes(first.data.code),false);
});
test('não recebe ID sem consentimento explícito', async()=>{
  const e=env();
  const created=await call(e,'/v1/session',{method:'POST',token:admin});
  const response=await call(e,'/v1/join',{method:'POST',body:{code:created.data.code,rustdeskId:'123456789',consent:false}});
  assert.equal(response.status,422);
  const state=await call(e,'/v1/session',{token:admin});
  assert.equal(state.data.session.state,'waiting');
});
test('transmite ID uma vez com código correto e não transmite senha', async()=>{
  const e=env();
  const created=await call(e,'/v1/session',{method:'POST',token:admin});
  const wrong=await call(e,'/v1/join',{method:'POST',body:{code:'ABCDEFGHJK',rustdeskId:'123456789',consent:true}});
  assert.equal(wrong.status,404);
  const correct=await call(e,'/v1/join',{method:'POST',body:{code:created.data.code,rustdeskId:'123 456 789',consent:true}});
  assert.equal(correct.status,200);
  const state=await call(e,'/v1/session',{token:admin});
  assert.equal(state.data.session.rustdeskId,'123456789');
  assert.equal(state.data.session.state,'ready');
  assert.equal(JSON.stringify(state.data).includes('password'),false);
  const duplicate=await call(e,'/v1/join',{method:'POST',body:{code:created.data.code,rustdeskId:'222222222',consent:true}});
  assert.equal(duplicate.status,404);
});
test('recusa campo de senha e IDs malformados', async()=>{
  const e=env();
  const created=await call(e,'/v1/session',{method:'POST',token:admin});
  const bad=await call(e,'/v1/join',{method:'POST',body:{code:created.data.code,rustdeskId:'<img>',consent:true}});
  assert.equal(bad.status,422);
  const pass=await call(e,'/v1/join',{method:'POST',body:{code:created.data.code,rustdeskId:'123456789',password:'do-not-store',consent:true}});
  assert.equal(pass.status,422);
});
test('encerramento elimina ID acessível e permite nova sessão',async()=>{
  const e=env();
  const created=await call(e,'/v1/session',{method:'POST',token:admin});
  await call(e,'/v1/join',{method:'POST',body:{code:created.data.code,rustdeskId:'987654321',consent:true}});
  const closed=await call(e,'/v1/session/close',{method:'POST',token:admin});
  assert.equal(closed.status,200);
  const state=await call(e,'/v1/session',{token:admin});
  assert.equal(state.data.session,null);
  const next=await call(e,'/v1/session',{method:'POST',token:admin});
  assert.equal(next.status,201);
});
