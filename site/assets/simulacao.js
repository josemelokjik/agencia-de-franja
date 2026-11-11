import {beginExperiment, advanceExperiment, exportExperiment} from './simulacao-model.mjs';

const byId = id => document.getElementById(id);
const screens = ['challenge-screen','verification-screen','debrief-screen'];
let current = null;

function show(screen) {
  for (const id of screens) byId(id).hidden = id !== screen;
}
document.querySelectorAll('[data-decision]').forEach(button => {
  button.addEventListener('click', () => {
    if (!current) return;
    current = advanceExperiment(current, button.dataset.decision, new Date().toISOString());
    if (current.phase === 'verification') {
      show('verification-screen');
      return;
    }
    byId('decision-result').textContent = current.outcome === 'intencao_instalar'
      ? 'Você demonstrou intenção de instalar um aplicativo a partir da solicitação simulada.'
      : 'Você optou por não prosseguir com a instalação simulada.';
    byId('decision-count').textContent = String(current.events.length);
    show('debrief-screen');
  });
});

byId('export').addEventListener('click', () => {
  if (!current || current.phase !== 'complete') return;
  const record = exportExperiment(current);
  const file = new Blob([JSON.stringify(record,null,2)], {type:'application/json;charset=utf-8'});
  const address = URL.createObjectURL(file);
  const a=document.createElement('a');
  a.href=address;
  a.download='simulacao-engenharia-social.json';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(address),1500);
});

byId('restart').addEventListener('click', () => {
  current=beginExperiment(new Date().toISOString());
  show('challenge-screen');
});
current=beginExperiment(new Date().toISOString());
show('challenge-screen');
