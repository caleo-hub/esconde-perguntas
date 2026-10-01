const test = require('node:test');
const assert = require('node:assert/strict');
const { compact, filterIncoming } = require('../js/question-dedup.js');

test('keeps the first position and strongest difficulty when identical pairs repeat in one list', () => {
  const questions = [
    { id: 'first', listaId: 'opioides', pergunta: 'Pergunta?', resposta: 'Resposta.', dificil: false, muitoDificil: false },
    { id: 'other', listaId: 'opioides', pergunta: 'Outra?', resposta: 'Sim.', dificil: false, muitoDificil: false },
    { id: 'second', listaId: 'opioides', pergunta: 'Pergunta?', resposta: 'Resposta.', dificil: true, muitoDificil: false },
    { id: 'third', listaId: 'opioides', pergunta: 'Pergunta?', resposta: 'Resposta.', dificil: true, muitoDificil: true }
  ];
  const result = compact(questions);
  assert.equal(result.removed, 2);
  assert.deepEqual(result.questions.map(item => item.id), ['first', 'other']);
  assert.equal(result.questions[0].dificil, true);
  assert.equal(result.questions[0].muitoDificil, true);
  assert.equal(questions[0].dificil, false);
});

test('allows the same question in another list or with another answer', () => {
  const items = [
    { id: 'a', listaId: 'um', pergunta: 'Q', resposta: 'A' },
    { id: 'b', listaId: 'dois', pergunta: 'Q', resposta: 'A' },
    { id: 'c', listaId: 'um', pergunta: 'Q', resposta: 'B' }
  ];
  assert.equal(compact(items).removed, 0);
});

test('filters repeats already stored and repeated within one new batch', () => {
  const existing = [{ listaId: 'um', pergunta: 'Antiga?', resposta: 'Sim.' }];
  const pairs = [
    { pergunta: 'Antiga?', resposta: 'Sim.' },
    { pergunta: 'Nova?', resposta: 'Sim.' },
    { pergunta: 'Nova?', resposta: 'Sim.' }
  ];
  assert.deepEqual(filterIncoming(pairs, existing, 'um'), { unique: [pairs[1]], skipped: 2 });
  assert.deepEqual(filterIncoming(pairs, existing, 'dois'), { unique: [pairs[0], pairs[1]], skipped: 1 });
});
