// Modelo puro: nenhuma chamada de rede ou acesso ao dispositivo.
export const SCENARIO_ID = 'solicitacao-instalacao-v1';
const ACTIONS = new Set(['install', 'verify', 'decline']);

function ensureTimestamp(value) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new TypeError('Data/hora inválida.');
  }
  return value;
}

export function beginExperiment(consented, at) {
  if (consented !== true) throw new Error('Consentimento obrigatório.');
  const timestamp = ensureTimestamp(at);
  return {
    scenarioId: SCENARIO_ID,
    phase: 'challenge',
    startedAt: timestamp,
    endedAt: null,
    outcome: null,
    events: [{ action: 'consent', at: timestamp }],
  };
}

export function advanceExperiment(previous, action, at) {
  if (!previous || !['challenge', 'verification'].includes(previous.phase)) {
    throw new Error('Experimento não iniciado ou já encerrado.');
  }
  if (!ACTIONS.has(action) || (previous.phase === 'verification' && action === 'verify')) {
    throw new Error('Escolha inválida para esta etapa.');
  }
  const timestamp = ensureTimestamp(at);
  if (Date.parse(timestamp) < Date.parse(previous.startedAt)) {
    throw new Error('Data/hora anterior ao início.');
  }
  const phase = action === 'verify' ? 'verification' : 'complete';
  const outcome = action === 'install' ? 'intencao_instalar' :
    action === 'decline' ? 'recusou_instalacao' : null;
  return {
    ...previous,
    phase,
    outcome,
    endedAt: phase === 'complete' ? timestamp : null,
    events: [...previous.events, { action, at: timestamp }],
  };
}

export function exportExperiment(previous) {
  if (!previous || previous.phase !== 'complete') {
    throw new Error('Finalize o experimento antes de exportar.');
  }
  return {
    schemaVersion: 1,
    scenarioId: previous.scenarioId,
    startedAt: previous.startedAt,
    endedAt: previous.endedAt,
    outcome: previous.outcome,
    decisions: previous.events.map(({ action, at }) => ({ action, at })),
    installationPerformed: false,
    permissionRequested: false,
    networkTelemetry: false,
  };
}
