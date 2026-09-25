(() => {
  'use strict';

  const STORAGE_KEY = 'escondePerguntas';
  const $ = id => document.getElementById(id);
  const state = { questions: [], shuffled: false, displayIds: [], studyIds: [], studyIndex: 0, studyRevealed: false, installPrompt: null };
  let toastTimer;

  function validQuestion(item) {
    return item && typeof item === 'object' && typeof item.pergunta === 'string' && typeof item.resposta === 'string' && item.pergunta.trim() && item.resposta.trim() && item.pergunta.length <= 2000 && item.resposta.length <= 10000;
  }

  function normalizeQuestion(item) {
    const now = new Date().toISOString();
    return { id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(), pergunta: item.pergunta.trim(), resposta: item.resposta.trim(), criadaEm: typeof item.criadaEm === 'string' ? item.criadaEm : now, atualizadaEm: typeof item.atualizadaEm === 'string' ? item.atualizadaEm : now };
  }

  function notify(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
  }

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(stored)) throw new Error('Formato inválido');
      state.questions = stored.filter(validQuestion).map(normalizeQuestion);
    } catch (error) {
      state.questions = [];
      notify('Não foi possível ler as perguntas salvas neste navegador.');
    }
  }

  function persist(next) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      state.questions = next;
      render();
      return true;
    } catch (error) {
      notify('Não foi possível salvar. Verifique o espaço ou as permissões do navegador.');
      return false;
    }
  }

  function shuffle(array) {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function orderedQuestions() {
    if (!state.shuffled) return state.questions;
    const byId = new Map(state.questions.map(item => [item.id, item]));
    const known = state.displayIds.map(id => byId.get(id)).filter(Boolean);
    const remaining = state.questions.filter(item => !state.displayIds.includes(item.id));
    return [...known, ...remaining];
  }

  function render() {
    $('countBadge').textContent = state.questions.length;
    $('heroActionIcon').textContent = state.questions.length ? '▶' : '＋';
    $('heroActionText').textContent = state.questions.length ? 'Começar revisão' : 'Criar pergunta';
    $('addButton').hidden = state.questions.length === 0;
    $('shuffleButton').disabled = state.questions.length < 2;
    const query = $('searchInput').value.trim().toLocaleLowerCase('pt-BR');
    const visible = orderedQuestions().filter(item => item.pergunta.toLocaleLowerCase('pt-BR').includes(query));
    const list = $('questionList');
    list.replaceChildren(...visible.map((item, index) => createCard(item, index)));
    $('emptyState').hidden = visible.length > 0;
    $('emptyTitle').textContent = state.questions.length ? 'Nenhuma pergunta encontrada' : 'Sua coleção começa aqui';
    $('emptyText').textContent = state.questions.length ? 'Tente buscar por outra palavra.' : 'Use os botões acima para criar uma pergunta ou colar uma lista inteira.';
  }

  function createCard(item, index) {
    const card = document.createElement('article');
    card.className = 'question-card';
    const top = document.createElement('div');
    top.className = 'card-top';
    const number = document.createElement('span');
    number.className = 'card-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const menuButton = document.createElement('button');
    menuButton.className = 'card-menu-button';
    menuButton.type = 'button';
    menuButton.setAttribute('aria-label', 'Opções da pergunta');
    menuButton.setAttribute('aria-expanded', 'false');
    menuButton.textContent = '⋮';
    top.append(number, menuButton);
    const menu = document.createElement('div');
    menu.className = 'card-menu';
    menu.hidden = true;
    const edit = document.createElement('button');
    edit.type = 'button'; edit.textContent = 'Editar';
    edit.addEventListener('click', () => openForm(item));
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'Excluir';
    remove.addEventListener('click', async () => {
      if (await confirmAction('Excluir pergunta?', 'Esta pergunta e sua resposta serão apagadas deste navegador.')) {
        if (persist(state.questions.filter(question => question.id !== item.id))) notify('Pergunta excluída.');
      }
    });
    menu.append(edit, remove);
    menuButton.addEventListener('click', () => { menu.hidden = !menu.hidden; menuButton.setAttribute('aria-expanded', String(!menu.hidden)); });
    const title = document.createElement('h3');
    title.textContent = item.pergunta;
    const answer = document.createElement('div');
    answer.className = 'card-answer'; answer.hidden = true;
    const label = document.createElement('div');
    label.className = 'eyebrow'; label.textContent = 'RESPOSTA';
    const content = document.createElement('p');
    content.textContent = item.resposta;
    answer.append(label, content);
    const reveal = document.createElement('button');
    reveal.className = 'reveal-button'; reveal.type = 'button'; reveal.textContent = 'Mostrar resposta';
    reveal.setAttribute('aria-expanded', 'false');
    reveal.addEventListener('click', () => { answer.hidden = !answer.hidden; reveal.textContent = answer.hidden ? 'Mostrar resposta' : 'Ocultar resposta'; reveal.setAttribute('aria-expanded', String(!answer.hidden)); });
    card.append(top, menu, title, answer, reveal);
    return card;
  }

  function openForm(item = null) {
    $('questionForm').reset();
    $('formError').hidden = true;
    $('questionId').value = item?.id || '';
    $('formTitle').textContent = item ? 'Editar pergunta' : 'Nova pergunta';
    $('questionField').value = item?.pergunta || '';
    $('answerField').value = item?.resposta || '';
    $('formDialog').showModal();
    $('questionField').focus();
  }

  function saveForm(event) {
    event.preventDefault();
    const pergunta = $('questionField').value.trim();
    const resposta = $('answerField').value.trim();
    if (!pergunta || !resposta) {
      $('formError').textContent = 'Preencha a pergunta e a resposta.';
      $('formError').hidden = false;
      (!pergunta ? $('questionField') : $('answerField')).focus();
      return;
    }
    const id = $('questionId').value;
    const now = new Date().toISOString();
    const existing = state.questions.find(item => item.id === id);
    const updated = existing ? state.questions.map(item => item.id === id ? { ...item, pergunta, resposta, atualizadaEm: now } : item) : [{ id: crypto.randomUUID(), pergunta, resposta, criadaEm: now, atualizadaEm: now }, ...state.questions];
    if (persist(updated)) { $('formDialog').close(); notify(existing ? 'Pergunta atualizada.' : 'Pergunta adicionada.'); }
  }

  function parseBatch(raw) {
    const text = raw.replace(/\r\n?/g, '\n').trim();
    if (!text) return { pairs: [], errors: 0 };
    const numbered = [...text.matchAll(/^\s*\d+[.)]\s+(.+)$/gm)];
    let blocks = numbered.length ? numbered.map((match, index) => {
      const end = index + 1 < numbered.length ? numbered[index + 1].index : text.length;
      return text.slice(match.index, end).replace(/^\s*\d+[.)]\s+/, '').trim();
    }) : text.split(/\n\s*\n/).map(block => block.trim()).filter(Boolean);
    if (!numbered.length && blocks.length === 1) {
      const lines = blocks[0].split('\n').map(line => line.trim()).filter(Boolean);
      if (lines.length > 1 && lines.every(line => line.includes('\t') || line.includes('|'))) blocks = lines;
    }
    const pairs = [];
    let errors = 0;
    for (const block of blocks) {
      const lines = block.split('\n').map(line => line.trim());
      let pergunta = '';
      let resposta = '';
      if (lines.length === 1) {
        const separator = lines[0].includes('\t') ? '\t' : '|';
        const position = lines[0].indexOf(separator);
        if (position >= 0) { pergunta = lines[0].slice(0, position).trim(); resposta = lines[0].slice(position + 1).trim(); }
      } else {
        const firstBlank = lines.findIndex((line, index) => index > 0 && !line);
        const meaningful = firstBlank < 0 ? lines : lines.slice(0, firstBlank);
        pergunta = meaningful.shift() || '';
        resposta = meaningful.join('\n').trim();
      }
      if (pergunta && resposta && pergunta.length <= 2000 && resposta.length <= 10000) pairs.push({ pergunta, resposta });
      else errors++;
    }
    return { pairs, errors };
  }

  function updateBatchPreview() {
    const { pairs, errors } = parseBatch($('batchField').value);
    $('batchPreview').textContent = `${pairs.length} par${pairs.length === 1 ? '' : 'es'} encontrado${pairs.length === 1 ? '' : 's'}${errors ? ` · ${errors} incompleto${errors === 1 ? '' : 's'}` : ''}.`;
    $('batchSave').disabled = !pairs.length || !!errors || pairs.length > 500;
    $('batchError').hidden = true;
  }

  function saveBatch(event) {
    event.preventDefault();
    const { pairs, errors } = parseBatch($('batchField').value);
    if (!pairs.length || errors || pairs.length > 500) {
      $('batchError').textContent = pairs.length > 500 ? 'Importe até 500 perguntas por vez.' : 'Confira os pares incompletos antes de adicionar.';
      $('batchError').hidden = false;
      return;
    }
    const now = new Date().toISOString();
    const incoming = pairs.map(({ pergunta, resposta }) => ({ id: crypto.randomUUID(), pergunta, resposta, criadaEm: now, atualizadaEm: now }));
    if (persist([...incoming, ...state.questions])) {
      $('batchDialog').close();
      notify(`${incoming.length} pergunta${incoming.length === 1 ? '' : 's'} adicionada${incoming.length === 1 ? '' : 's'}.`);
    }
  }

  function confirmAction(title, message) {
    return new Promise(resolve => {
      const dialog = $('confirmDialog');
      $('confirmTitle').textContent = title;
      $('confirmText').textContent = message;
      const accept = () => { cleanup(); dialog.close(); resolve(true); };
      const cancel = () => { cleanup(); dialog.close(); resolve(false); };
      const closed = () => { cleanup(); resolve(false); };
      const cleanup = () => { $('confirmAccept').removeEventListener('click', accept); $('confirmCancel').removeEventListener('click', cancel); dialog.removeEventListener('close', closed); };
      $('confirmAccept').addEventListener('click', accept);
      $('confirmCancel').addEventListener('click', cancel);
      dialog.addEventListener('close', closed);
      dialog.showModal();
    });
  }

  function renderStudy() {
    const item = state.questions.find(question => question.id === state.studyIds[state.studyIndex]);
    if (!item) { $('studyDialog').close(); return; }
    $('studyCounter').textContent = `Pergunta ${state.studyIndex + 1} de ${state.studyIds.length}`;
    $('progressFill').style.width = `${((state.studyIndex + 1) / state.studyIds.length) * 100}%`;
    $('studyQuestion').textContent = item.pergunta;
    $('studyAnswer').textContent = item.resposta;
    $('studyAnswerBlock').hidden = !state.studyRevealed;
    $('studyReveal').textContent = state.studyRevealed ? 'Ocultar resposta' : 'Mostrar resposta';
    $('studyReveal').setAttribute('aria-expanded', String(state.studyRevealed));
    $('studyPrevious').disabled = state.studyIndex === 0;
    $('studyNext').disabled = state.studyIndex === state.studyIds.length - 1;
  }

  function startStudy() {
    if (!state.questions.length) return;
    state.studyIds = orderedQuestions().map(item => item.id);
    state.studyIndex = 0;
    state.studyRevealed = false;
    renderStudy();
    $('studyDialog').showModal();
  }

  function exportBackup() {
    const data = { version: 1, exportadoEm: new Date().toISOString(), perguntas: state.questions };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `esconde-perguntas-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Backup exportado.');
  }

  async function importBackup(file) {
    if (!file) return;
    if (file.size > 5_000_000) { notify('O arquivo é grande demais para importar.'); return; }
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.version !== 1 || !Array.isArray(data.perguntas) || !data.perguntas.every(validQuestion)) throw new Error('Formato inválido');
      if (!data.perguntas.length) { notify('O backup não contém perguntas.'); return; }
      const existingIds = new Set(state.questions.map(item => item.id));
      const incoming = data.perguntas.map(normalizeQuestion).map(item => {
        if (existingIds.has(item.id)) item.id = crypto.randomUUID();
        existingIds.add(item.id);
        return item;
      });
      if (persist([...incoming, ...state.questions])) notify(`${incoming.length} pergunta${incoming.length === 1 ? '' : 's'} importada${incoming.length === 1 ? '' : 's'}.`);
    } catch (error) {
      notify('Arquivo inválido. Selecione um backup JSON do aplicativo.');
    } finally {
      $('importInput').value = '';
    }
  }

  function closeMenu() { $('menu').hidden = true; $('menuButton').setAttribute('aria-expanded', 'false'); }

  function setup() {
    load(); render();
    $('addButton').addEventListener('click', () => openForm());
    $('questionForm').addEventListener('submit', saveForm);
    $('searchInput').addEventListener('input', render);
    $('shuffleButton').addEventListener('click', () => {
      state.shuffled = !state.shuffled;
      state.displayIds = state.shuffled ? shuffle(state.questions.map(item => item.id)) : [];
      $('shuffleButton').setAttribute('aria-pressed', String(state.shuffled));
      render();
    });
    $('studyButton').addEventListener('click', () => state.questions.length ? startStudy() : openForm());
    $('batchButton').addEventListener('click', () => { $('batchField').value = ''; updateBatchPreview(); $('batchDialog').showModal(); });
    $('batchField').addEventListener('input', updateBatchPreview);
    $('batchForm').addEventListener('submit', saveBatch);
    $('copyPromptButton').addEventListener('click', async () => {
      const prompt = 'Transforme o texto que vou enviar em uma lista numerada de pares de pergunta e resposta. Use exatamente este formato para cada item: número, ponto, espaço, pergunta em uma linha; resposta na linha seguinte; uma linha vazia entre os itens. Não acrescente introdução, comentários ou perguntas sem resposta. Preserve o conteúdo e não invente respostas.\n\nCole meu texto abaixo:\n';
      try { await navigator.clipboard.writeText(prompt); notify('Prompt copiado. Cole no ChatGPT junto com seu texto.'); }
      catch (error) { notify('Não foi possível copiar. Tente abrir o site por HTTPS.'); }
    });
    $('studyClose').addEventListener('click', () => $('studyDialog').close());
    $('studyReveal').addEventListener('click', () => { state.studyRevealed = !state.studyRevealed; renderStudy(); });
    $('studyPrevious').addEventListener('click', () => { if (state.studyIndex > 0) { state.studyIndex--; state.studyRevealed = false; renderStudy(); } });
    $('studyNext').addEventListener('click', () => { if (state.studyIndex < state.studyIds.length - 1) { state.studyIndex++; state.studyRevealed = false; renderStudy(); } });
    $('studyShuffle').addEventListener('click', () => { state.studyIds = shuffle(state.studyIds); state.studyIndex = 0; state.studyRevealed = false; renderStudy(); notify('Revisão embaralhada.'); });
    document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
    $('menuButton').addEventListener('click', () => { $('menu').hidden = !$('menu').hidden; $('menuButton').setAttribute('aria-expanded', String(!$('menu').hidden)); });
    document.addEventListener('click', event => { if (!$('menu').contains(event.target) && !$('menuButton').contains(event.target)) closeMenu(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
    $('exportButton').addEventListener('click', () => { closeMenu(); exportBackup(); });
    $('importButton').addEventListener('click', () => { closeMenu(); $('importInput').click(); });
    $('importInput').addEventListener('change', event => importBackup(event.target.files[0]));
    $('aboutButton').addEventListener('click', () => { closeMenu(); $('aboutDialog').showModal(); });
    $('deleteAllButton').addEventListener('click', async () => { closeMenu(); if (!state.questions.length) { notify('Não há perguntas para apagar.'); return; } if (await confirmAction('Apagar todas as perguntas?', 'Todas as perguntas e respostas deste navegador serão apagadas. Exporte um backup antes, se quiser guardá-las.')) { if (persist([])) notify('Todas as perguntas foram apagadas.'); } });
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; $('installButton').hidden = false; });
    $('installButton').addEventListener('click', async () => { closeMenu(); if (state.installPrompt) { await state.installPrompt.prompt(); state.installPrompt = null; $('installButton').hidden = true; } });
    window.addEventListener('appinstalled', () => { state.installPrompt = null; $('installButton').hidden = true; });
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  setup();
})();
