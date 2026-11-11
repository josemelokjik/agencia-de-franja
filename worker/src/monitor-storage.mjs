/** Somente resumos por aplicativo/dia, sem horários individuais nem capturas. */
export class D1MonitorStore {
  constructor(db){this.db=db;}
  async upsert(alias,summaries,at){
    const sql=`INSERT INTO monitor_daily (alias, day, package_name, opens, uploaded_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(alias,day,package_name) DO UPDATE SET opens=excluded.opens,uploaded_at=excluded.uploaded_at`;
    const statements=summaries.map(s=>this.db.prepare(sql).bind(alias,s.day,s.package,s.opens,at));
    await this.db.batch(statements);
    return summaries.length;
  }
  async list(){
    const cutoff=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
    const result=await this.db.prepare(`SELECT alias,day,package_name as package,opens,uploaded_at as uploadedAt
      FROM monitor_daily WHERE day>=? ORDER BY day DESC, alias ASC, package_name ASC LIMIT 2000`).bind(cutoff).all();
    return result.results || [];
  }
  async deleteAlias(alias){
    const result=await this.db.prepare('DELETE FROM monitor_daily WHERE alias=?').bind(alias).run();
    return Number(result.meta?.changes||0);
  }
  async purgeExpired(now){
    const day=new Date(now-30*86400000).toISOString().slice(0,10);
    await this.db.prepare('DELETE FROM monitor_daily WHERE day<?').bind(day).run();
  }
}
