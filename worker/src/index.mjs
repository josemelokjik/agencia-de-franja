import {handleRequest} from './core.mjs';
import {D1SessionStore} from './storage.mjs';
import {D1MonitorStore} from './monitor-storage.mjs';
export default {
  fetch(request, env) { return handleRequest(request,env); },
  async scheduled(_event,env) {
    await new D1SessionStore(env.DB).purgeExpired(Date.now());
    await new D1MonitorStore(env.DB).purgeExpired(Date.now());
  }
};
