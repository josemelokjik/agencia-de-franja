/** Adaptador D1: a restrição singleton é aplicada atomicamente no SQLite. */
export class D1SessionStore {
  constructor(db) { this.db=db; }
  async create(s) {
    const result=await this.db.prepare(`
      INSERT INTO active_session (singleton, session_id, pairing_hash, rustdesk_id, state, created_at, expires_at, consented_at)
      VALUES (1, ?, ?, NULL, 'waiting', ?, ?, NULL)
      ON CONFLICT(singleton) DO UPDATE SET
        session_id=excluded.session_id, pairing_hash=excluded.pairing_hash,
        rustdesk_id=NULL, state='waiting', created_at=excluded.created_at,
        expires_at=excluded.expires_at, consented_at=NULL
      WHERE active_session.state='closed' OR active_session.expires_at<=excluded.created_at
    `).bind(s.sessionId,s.hash,s.createdAt,s.expiresAt).run();
    return Number(result.meta.changes)===1;
  }
  async get(now) {
    const row=await this.db.prepare(`SELECT session_id, rustdesk_id, state, expires_at, consented_at
      FROM active_session WHERE singleton=1 AND state!='closed' AND expires_at>?`).bind(now).first();
    return row ? {sessionId:row.session_id,rustdeskId:row.rustdesk_id,state:row.state,
      expiresAt:row.expires_at,consentedAt:row.consented_at} : null;
  }
  async submit(hash,id,now) {
    const result=await this.db.prepare(`UPDATE active_session SET rustdesk_id=?, state='ready', consented_at=?
      WHERE singleton=1 AND pairing_hash=? AND state='waiting' AND expires_at>?`).bind(id,now,hash,now).run();
    return Number(result.meta.changes)===1;
  }
  async close() {
    const result=await this.db.prepare(`UPDATE active_session SET state='closed', rustdesk_id=NULL,
      pairing_hash='', consented_at=NULL WHERE singleton=1 AND state!='closed'`).run();
    return Number(result.meta.changes)>0;
  }
  async purgeExpired(now) {
    await this.db.prepare(`UPDATE active_session SET state='closed', rustdesk_id=NULL,
      pairing_hash='', consented_at=NULL WHERE expires_at<=?`).bind(now).run();
  }
}
