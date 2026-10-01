(() => {
  'use strict';

  const clean = value => String(value || '').replace(/\r\n?/g, '\n').trim();
  const pairKey = (item, listId = item.listaId) => JSON.stringify([listId, clean(item.pergunta), clean(item.resposta)]);

  function compact(questions) {
    const positions = new Map();
    const kept = [];
    let removed = 0;
    for (const item of questions) {
      const key = pairKey(item);
      if (!positions.has(key)) {
        positions.set(key, kept.length);
        kept.push(item);
        continue;
      }
      removed++;
      const index = positions.get(key);
      const original = kept[index];
      const muitoDificil = original.muitoDificil === true || item.muitoDificil === true;
      const dificil = original.dificil === true || item.dificil === true || muitoDificil;
      if (original.dificil !== dificil || original.muitoDificil !== muitoDificil) {
        kept[index] = { ...original, dificil, muitoDificil };
      }
    }
    return { questions: kept, removed };
  }

  function filterIncoming(pairs, existing, listId) {
    const seen = new Set(existing.filter(item => item.listaId === listId).map(item => pairKey(item)));
    const unique = [];
    let skipped = 0;
    for (const pair of pairs) {
      const key = pairKey(pair, listId);
      if (seen.has(key)) skipped++;
      else { seen.add(key); unique.push(pair); }
    }
    return { unique, skipped };
  }

  const api = { pairKey, compact, filterIncoming };
  globalThis.QuestionDedup = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
