import test from 'node:test';
import assert from 'node:assert/strict';
import {beginExperiment, advanceExperiment, exportExperiment, SCENARIO_ID} from '../site/assets/simulacao-model.mjs';

const t0 = '2026-11-11T12:00:00.000Z';
const t1 = '2026-11-11T12:00:04.000Z';
const t2 = '2026-11-11T12:00:07.000Z';

test('não inicia sem consentimento', () => {
  assert.throws(() => beginExperiment(false, t0), /Consentimento/);
  assert.throws(() => beginExperiment(undefined, t0), /Consentimento/);
});

test('inicia com uma única decisão de consentimento', () => {
  const session = beginExperiment(true, t0);
  assert.equal(session.scenarioId, SCENARIO_ID);
  assert.equal(session.phase, 'challenge');
  assert.deepEqual(session.events, [{action:'consent', at:t0}]);
});

test('instalação é apenas intenção e encerra a simulação', () => {
  const finished = advanceExperiment(beginExperiment(true, t0), 'install', t1);
  assert.equal(finished.phase, 'complete');
  assert.equal(finished.outcome, 'intencao_instalar');
  assert.equal(exportExperiment(finished).installationPerformed, false);
});

test('recusa encerra sem instalação', () => {
  const finished = advanceExperiment(beginExperiment(true, t0), 'decline', t1);
  assert.equal(finished.outcome, 'recusou_instalacao');
});

test('verificar origem permite recusar depois', () => {
  const started = beginExperiment(true,t0);
  const checked = advanceExperiment(started,'verify',t1);
  assert.equal(checked.phase,'verification');
  const finished = advanceExperiment(checked,'decline',t2);
  assert.deepEqual(finished.events.map(e=>e.action), ['consent','verify','decline']);
});

test('não aceita repetir verificação ou decidir duas vezes', () => {
  const checked=advanceExperiment(beginExperiment(true,t0),'verify',t1);
  assert.throws(()=>advanceExperiment(checked,'verify',t2),/Escolha inválida/);
  const completed=advanceExperiment(checked,'decline',t2);
  assert.throws(()=>advanceExperiment(completed,'install',t2),/encerrado/);
});

test('entrada inválida e exportação prematura são rejeitadas', () => {
  const started=beginExperiment(true,t0);
  assert.throws(()=>advanceExperiment(started,'unknown',t1),/inválida/);
  assert.throws(()=>advanceExperiment(started,'decline','data ruim'),/Data\/hora/);
  assert.throws(()=>exportExperiment(started),/Finalize/);
});

test('exportação contém somente ações, tempo e desfecho', () => {
  const finished=advanceExperiment(beginExperiment(true,t0),'install',t1);
  const report=exportExperiment(finished);
  assert.deepEqual(Object.keys(report),[
    'schemaVersion','scenarioId','startedAt','endedAt','outcome',
    'decisions','installationPerformed','permissionRequested','networkTelemetry'
  ]);
  assert.equal(report.networkTelemetry,false);
  assert.equal(report.permissionRequested,false);
  assert.equal(JSON.stringify(report).includes('rustdeskId'),false);
});
