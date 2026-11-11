import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeLocalReport} from '../site/assets/monitor-model.mjs';

const base={schemaVersion:1,generatedAt:'2026-11-11T12:00:00.000Z',retentionDays:7,selectedPackages:['br.com.empresa.app'],events:[
  {package:'br.com.empresa.app',event:'OPEN',timeEpochMs:Date.parse('2026-11-10T10:00:00.000Z')},
  {package:'br.com.empresa.app',event:'PAUSE',timeEpochMs:Date.parse('2026-11-10T10:10:00.000Z')},
  {package:'br.com.empresa.app',event:'OPEN',timeEpochMs:Date.parse('2026-11-10T12:00:00.000Z')},
  {package:'br.com.outro.app',event:'OPEN',timeEpochMs:Date.parse('2026-11-10T14:00:00.000Z')},
]};

test('produz apenas contagens diárias de abertura para aplicativos selecionados',()=>{
  assert.deepEqual(summarizeLocalReport(base),{
    generatedAt:base.generatedAt, summaries:[{day:'2026-11-10',package:'br.com.empresa.app',opens:2}]
  });
});
test('não aceita campos adicionais que possam conter dados pessoais',()=>{
  assert.throws(()=>summarizeLocalReport({...base,messages:['segredo']}),/Campos/);
  assert.throws(()=>summarizeLocalReport({...base,events:[{...base.events[0],screenText:'privado'}]}),/Campos/);
});
test('recusa relatórios grandes ou inválidos',()=>{
  assert.throws(()=>summarizeLocalReport({...base,events:new Array(5001).fill(base.events[0])}),/Limite/);
  assert.throws(()=>summarizeLocalReport({...base,events:[{...base.events[0],timeEpochMs:'inválido'}]}),/inválido/);
  assert.throws(()=>summarizeLocalReport({...base,selectedPackages:['br.com.empresa.app'],events:'invalido'}),/eventos/);
});
