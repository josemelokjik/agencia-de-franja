// O navegador resume eventos locais antes de qualquer transmissão: nada de dados brutos no servidor.
const PACKAGE=/^(?:[A-Za-z][A-Za-z0-9_]*\.)+[A-Za-z][A-Za-z0-9_]*$/;
function onlyKeys(obj, allowed) {
  return obj && typeof obj==='object' && !Array.isArray(obj)
    && Object.keys(obj).every(k => allowed.includes(k));
}
export function summarizeLocalReport(report) {
  if (!onlyKeys(report,['schemaVersion','generatedAt','retentionDays','selectedPackages','events']))
    throw new Error('Campos não permitidos no relatório.');
  if (report.schemaVersion!==1 || !Number.isFinite(Date.parse(report.generatedAt)))
    throw new Error('Versão ou data inválida.');
  if (!Array.isArray(report.selectedPackages) || report.selectedPackages.length>64
    || report.selectedPackages.some(p=>typeof p!=='string'||p.length>150||!PACKAGE.test(p)))
    throw new Error('Aplicativos selecionados inválidos.');
  if (!Array.isArray(report.events)) throw new Error('Lista de eventos inválida.');
  if (report.events.length>5000) throw new Error('Limite de 5.000 eventos por arquivo.');
  const selected=new Set(report.selectedPackages);
  const counts=new Map();
  for (const event of report.events) {
    if (!onlyKeys(event,['package','event','timeEpochMs'])) throw new Error('Campos não permitidos em evento.');
    if (typeof event.package!=='string' || !PACKAGE.test(event.package)
      || !['OPEN','PAUSE','STOP'].includes(event.event)
      || !Number.isSafeInteger(event.timeEpochMs) || event.timeEpochMs<0
      || !Number.isFinite(new Date(event.timeEpochMs).getTime()))
      throw new Error('Evento inválido.');
    if (event.event!=='OPEN' || !selected.has(event.package)) continue;
    const day=new Date(event.timeEpochMs).toISOString().slice(0,10);
    const key=day+'|'+event.package;
    counts.set(key, (counts.get(key)||0)+1);
  }
  return {generatedAt:report.generatedAt,
    summaries:[...counts].sort(([a],[b])=>a.localeCompare(b)).map(([key,opens])=>{
      const [day,packageName]=key.split('|');return {day,package:packageName,opens};
    })};
}
