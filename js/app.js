(() => {
  'use strict';

  const STORAGE_KEY = 'escondePerguntas';
  const GENERAL_ID = 'geral';
  const $ = id => document.getElementById(id);
  const state = { questions: [], lists: [{ id: GENERAL_ID, nome: 'Geral' }], currentListId: null, filter: 'all', revealedIds: new Set(), shuffled: false, displayIds: [], studyIds: [], studyIndex: 0, studyRevealed: false, installPrompt: null };
  let toastTimer;

  function validQuestion(item) {
    return item && typeof item === 'object' && typeof item.pergunta === 'string' && typeof item.resposta === 'string' && item.pergunta.trim() && item.resposta.trim() && item.pergunta.length <= 2000 && item.resposta.length <= 10000;
  }

  function normalizeQuestion(item) {
    const now = new Date().toISOString();
    return { id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(), listaId: typeof item.listaId === 'string' ? item.listaId : GENERAL_ID, pergunta: item.pergunta.trim(), resposta: item.resposta.trim(), dificil: item.dificil === true || item.muitoDificil === true, muitoDificil: item.muitoDificil === true, criadaEm: typeof item.criadaEm === 'string' ? item.criadaEm : now, atualizadaEm: typeof item.atualizadaEm === 'string' ? item.atualizadaEm : now };
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
      const legacy = Array.isArray(stored);
      if (!legacy && (!stored || stored.version !== 2 || !Array.isArray(stored.listas) || !Array.isArray(stored.perguntas))) throw new Error('Formato inválido');
      const lists = legacy ? [] : stored.listas.filter(item => item && typeof item.id === 'string' && typeof item.nome === 'string' && item.nome.trim()).map(item => ({ id: item.id, nome: item.nome.trim() }));
      state.lists = [{ id: GENERAL_ID, nome: lists.find(item => item.id === GENERAL_ID)?.nome || 'Geral' }, ...lists.filter(item => item.id !== GENERAL_ID)];
      const validIds = new Set(state.lists.map(item => item.id));
      state.questions = (legacy ? stored : stored.perguntas).filter(validQuestion).map(normalizeQuestion).map(item => validIds.has(item.listaId) ? item : { ...item, listaId: GENERAL_ID });
      if (legacy && localStorage.getItem(STORAGE_KEY) !== null) {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, listas: state.lists, perguntas: state.questions })); }
        catch (error) { notify('Não foi possível atualizar os dados salvos. Exporte um backup antes de fechar o navegador.'); }
      }
    } catch (error) {
      state.questions = [];
      state.lists = [{ id: GENERAL_ID, nome: 'Geral' }];
      notify('Não foi possível ler as perguntas salvas neste navegador.');
    }
  }

  function persist(next, nextLists = state.lists) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 2, listas: nextLists, perguntas: next }));
      state.questions = next;
      state.lists = nextLists;
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

  function visibleQuestions() {
    const query = $('searchInput').value.trim().toLocaleLowerCase('pt-BR');
    return orderedQuestions().filter(item => item.listaId === state.currentListId && (state.filter === 'all' || (state.filter === 'difficult' && item.dificil) || (state.filter === 'very' && item.muitoDificil)) && item.pergunta.toLocaleLowerCase('pt-BR').includes(query));
  }

  function updateDifficultButton(button, difficult, withText = false) {
    button.textContent = withText ? (difficult ? '★ Difícil' : '☆ Marcar difícil') : (difficult ? '★' : '☆');
    button.setAttribute('aria-pressed', String(difficult));
    button.setAttribute('aria-label', difficult ? 'Desmarcar como difícil' : 'Marcar como difícil');
  }

  function updateVeryButton(button, very, withText = false) {
    button.textContent = withText ? '! Muito difícil' : '!';
    button.setAttribute('aria-pressed', String(very));
    button.setAttribute('aria-label', very ? 'Desmarcar como muito difícil' : 'Marcar como muito difícil');
    button.title = very ? 'Voltar para difícil' : 'Marcar como muito difícil';
  }

  function updateRevealAllButton(visible = visibleQuestions()) {
    const button = $('revealAllButton');
    button.disabled = !visible.length;
    button.textContent = visible.length && visible.every(item => state.revealedIds.has(item.id)) ? 'Ocultar todas' : 'Mostrar todas';
    button.setAttribute('aria-label', `${button.textContent} as respostas dos cartões exibidos`);
  }

  function toggleRevealAll() {
    const visible = visibleQuestions();
    if (!visible.length) return;
    const hide = visible.every(item => state.revealedIds.has(item.id));
    for (const item of visible) {
      if (hide) state.revealedIds.delete(item.id);
      else state.revealedIds.add(item.id);
    }
    render();
  }

  function toggleDifficult(id, fromStudy = false) {
    const item = state.questions.find(question => question.id === id);
    if (!item) return;
    if (!persist(state.questions.map(question => question.id === id ? { ...question, dificil: !question.dificil, muitoDificil: false, atualizadaEm: new Date().toISOString() } : question))) return;
    if (fromStudy) renderStudy();
    else {
      const card = [...$('questionList').children].find(element => element.dataset.id === id);
      (card?.querySelector('.difficult-button') || $('filterDifficult')).focus({ preventScroll: true });
    }
  }

  function toggleVeryDifficult(id, fromStudy = false) {
    const item = state.questions.find(question => question.id === id);
    if (!item?.dificil) return;
    if (!persist(state.questions.map(question => question.id === id ? { ...question, muitoDificil: !question.muitoDificil, atualizadaEm: new Date().toISOString() } : question))) return;
    if (fromStudy) renderStudy();
    else {
      const card = [...$('questionList').children].find(element => element.dataset.id === id);
      (card?.querySelector('.very-button') || $('filterVery')).focus({ preventScroll: true });
    }
  }

  function openList(id) {
    if (!state.lists.some(list => list.id === id)) return;
    state.currentListId = id;
    state.filter = 'all';
    state.shuffled = false;
    state.displayIds = [];
    $('shuffleButton').setAttribute('aria-pressed', 'false');
    $('searchInput').value = '';
    $('listOptions').hidden = true;
    $('listOptionsButton').setAttribute('aria-expanded', 'false');
    render();
    window.scrollTo(0, 0);
  }

  function renderHome() {
    const cards = state.lists.map(list => {
      const questions = state.questions.filter(item => item.listaId === list.id);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'list-card';
      button.dataset.id = list.id;
      const icon = document.createElement('span');
      icon.className = 'list-card-icon';
      icon.textContent = list.id === GENERAL_ID ? '✦' : '▦';
      const name = document.createElement('strong');
      name.textContent = list.nome;
      const meta = document.createElement('span');
      meta.className = 'list-card-meta';
      const difficultCount = questions.filter(item => item.dificil).length;
      const veryCount = questions.filter(item => item.muitoDificil).length;
      meta.textContent = `${questions.length} pergunta${questions.length === 1 ? '' : 's'} · ★ ${difficultCount} difíceis · ! ${veryCount} muito difíceis`;
      const arrow = document.createElement('span');
      arrow.className = 'list-card-arrow';
      arrow.setAttribute('aria-hidden', 'true');
      arrow.textContent = '→';
      button.append(icon, name, meta, arrow);
      button.addEventListener('click', () => openList(list.id));
      return button;
    });
    $('listGrid').replaceChildren(...cards);
  }

  function render() {
    if (state.currentListId && !state.lists.some(list => list.id === state.currentListId)) state.currentListId = null;
    $('homeView').hidden = state.currentListId !== null;
    $('listView').hidden = state.currentListId === null;
    renderHome();
    if (!state.currentListId) { $('addButton').hidden = true; return; }
    const currentList = state.lists.find(list => list.id === state.currentListId);
    const listQuestions = state.questions.filter(item => item.listaId === state.currentListId);
    const visible = visibleQuestions();
    const difficultCount = listQuestions.filter(item => item.dificil).length;
    const veryCount = listQuestions.filter(item => item.muitoDificil).length;
    const difficultFilter = state.filter === 'difficult';
    const veryFilter = state.filter === 'very';
    $('listName').textContent = currentList.nome;
    $('listSummary').textContent = `${listQuestions.length} pergunta${listQuestions.length === 1 ? '' : 's'} nesta lista · ★ ${difficultCount} difíceis · ! ${veryCount} muito difíceis`;
    $('deleteListButton').hidden = currentList.id === GENERAL_ID;
    $('allCount').textContent = listQuestions.length;
    $('difficultCount').textContent = difficultCount;
    $('veryCount').textContent = veryCount;
    $('filterAll').setAttribute('aria-pressed', String(state.filter === 'all'));
    $('filterDifficult').setAttribute('aria-pressed', String(difficultFilter));
    $('filterVery').setAttribute('aria-pressed', String(veryFilter));
    $('countBadge').textContent = listQuestions.length;
    $('heroActionIcon').textContent = listQuestions.length || state.filter !== 'all' ? '▶' : '＋';
    $('heroActionText').textContent = veryFilter ? 'Revisar muito difíceis' : difficultFilter ? 'Revisar difíceis' : (listQuestions.length ? 'Começar revisão' : 'Criar pergunta');
    $('studyButton').disabled = !visible.length && (state.filter !== 'all' || listQuestions.length > 0);
    $('addButton').hidden = listQuestions.length === 0;
    $('shuffleButton').disabled = visible.length < 2;
    updateRevealAllButton(visible);
    const list = $('questionList');
    list.replaceChildren(...visible.map((item, index) => createCard(item, index)));
    $('emptyState').hidden = visible.length > 0;
    $('emptyTitle').textContent = listQuestions.length ? 'Nenhuma pergunta encontrada' : 'Esta lista começa aqui';
    $('emptyText').textContent = listQuestions.length ? 'Tente buscar por outra palavra.' : 'Crie uma pergunta ou cole um lote neste assunto.';
    if (difficultFilter && !difficultCount) {
      $('emptyTitle').textContent = 'Nenhuma pergunta difícil ainda';
      $('emptyText').textContent = 'Marque uma pergunta com a estrela para revisar aqui.';
    }
    if (veryFilter && !veryCount) {
      $('emptyTitle').textContent = 'Nenhuma pergunta muito difícil ainda';
      $('emptyText').textContent = 'Marque uma pergunta como difícil e toque em ! para revisar aqui.';
    }
  }

  function createCard(item, index) {
    const card = document.createElement('article');
    card.className = 'question-card';
    card.dataset.id = item.id;
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
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const difficult = document.createElement('button');
    difficult.type = 'button';
    difficult.className = 'difficult-button';
    updateDifficultButton(difficult, item.dificil);
    difficult.addEventListener('click', () => toggleDifficult(item.id));
    const very = document.createElement('button');
    very.type = 'button';
    very.className = 'very-button';
    very.hidden = !item.dificil;
    updateVeryButton(very, item.muitoDificil);
    very.addEventListener('click', () => toggleVeryDifficult(item.id));
    actions.append(difficult, very, menuButton);
    top.append(number, actions);
    const menu = document.createElement('div');
    menu.className = 'card-menu';
    menu.hidden = true;
    const edit = document.createElement('button');
    edit.type = 'button'; edit.textContent = 'Editar';
    edit.addEventListener('click', () => openForm(item));
    const move = document.createElement('button');
    move.type = 'button'; move.textContent = 'Mover';
    move.addEventListener('click', () => openMove(item));
    const remove = document.createElement('button');
    remove.type = 'button'; remove.textContent = 'Excluir';
    remove.addEventListener('click', async () => {
      if (await confirmAction('Excluir pergunta?', 'Esta pergunta e sua resposta serão apagadas deste navegador.')) {
        if (persist(state.questions.filter(question => question.id !== item.id))) notify('Pergunta excluída.');
      }
    });
    menu.append(edit, move, remove);
    menuButton.addEventListener('click', () => { menu.hidden = !menu.hidden; menuButton.setAttribute('aria-expanded', String(!menu.hidden)); });
    const title = document.createElement('h3');
    title.textContent = item.pergunta;
    const answer = document.createElement('div');
    answer.className = 'card-answer'; answer.hidden = !state.revealedIds.has(item.id);
    const label = document.createElement('div');
    label.className = 'eyebrow'; label.textContent = 'RESPOSTA';
    const content = document.createElement('p');
    content.textContent = item.resposta;
    answer.append(label, content);
    const reveal = document.createElement('button');
    reveal.className = 'reveal-button'; reveal.type = 'button'; reveal.textContent = answer.hidden ? 'Mostrar resposta' : 'Ocultar resposta';
    reveal.setAttribute('aria-expanded', String(!answer.hidden));
    reveal.addEventListener('click', () => { answer.hidden = !answer.hidden; if (answer.hidden) state.revealedIds.delete(item.id); else state.revealedIds.add(item.id); reveal.textContent = answer.hidden ? 'Mostrar resposta' : 'Ocultar resposta'; reveal.setAttribute('aria-expanded', String(!answer.hidden)); updateRevealAllButton(); });
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
    const updated = existing ? state.questions.map(item => item.id === id ? { ...item, pergunta, resposta, atualizadaEm: now } : item) : [{ id: crypto.randomUUID(), listaId: state.currentListId, pergunta, resposta, dificil: false, muitoDificil: false, criadaEm: now, atualizadaEm: now }, ...state.questions];
    if (persist(updated)) { $('formDialog').close(); notify(existing ? 'Pergunta atualizada.' : 'Pergunta adicionada.'); }
  }

  function openListForm(list = null) {
    $('listForm').reset();
    $('listError').hidden = true;
    $('listIdField').value = list?.id || '';
    $('listNameField').value = list?.nome || '';
    $('listFormTitle').textContent = list ? 'Renomear lista' : 'Nova lista';
    $('listDialog').showModal();
    $('listNameField').focus();
  }

  function saveListForm(event) {
    event.preventDefault();
    const name = $('listNameField').value.trim();
    const id = $('listIdField').value;
    const normalized = name.toLocaleLowerCase('pt-BR');
    const error = !name ? 'Digite um nome para a lista.' : state.lists.some(list => list.id !== id && list.nome.toLocaleLowerCase('pt-BR') === normalized) ? 'Já existe uma lista com esse nome.' : '';
    if (error) {
      $('listError').textContent = error;
      $('listError').hidden = false;
      $('listNameField').focus();
      return;
    }
    if (id) {
      if (persist(state.questions, state.lists.map(list => list.id === id ? { ...list, nome: name } : list))) {
        $('listDialog').close();
        notify('Lista renomeada.');
      }
    } else {
      const newId = crypto.randomUUID();
      if (persist(state.questions, [...state.lists, { id: newId, nome: name }])) {
        $('listDialog').close();
        openList(newId);
        notify('Lista criada.');
      }
    }
  }

  function openMove(item) {
    const targets = state.lists.filter(list => list.id !== item.listaId);
    if (!targets.length) { notify('Crie outra lista antes de mover esta pergunta.'); return; }
    $('moveQuestionId').value = item.id;
    $('moveTarget').replaceChildren(...targets.map(list => {
      const option = document.createElement('option');
      option.value = list.id;
      option.textContent = list.nome;
      return option;
    }));
    $('moveDialog').showModal();
  }

  function saveMove(event) {
    event.preventDefault();
    const id = $('moveQuestionId').value;
    const target = $('moveTarget').value;
    if (!state.lists.some(list => list.id === target) || !state.questions.some(item => item.id === id)) return;
    if (persist(state.questions.map(item => item.id === id ? { ...item, listaId: target, atualizadaEm: new Date().toISOString() } : item))) {
      $('moveDialog').close();
      notify('Pergunta movida.');
    }
  }

  async function deleteCurrentList() {
    const id = state.currentListId;
    if (!id || id === GENERAL_ID) return;
    const list = state.lists.find(item => item.id === id);
    const count = state.questions.filter(item => item.listaId === id).length;
    const generalName = state.lists.find(item => item.id === GENERAL_ID).nome;
    if (await confirmAction(`Excluir ${list.nome}?`, count ? `${count} pergunta${count === 1 ? '' : 's'} desta lista serão movidas para ${generalName}, com respostas e estrelas preservadas.` : 'Esta lista vazia será excluída.', 'Excluir lista')) {
      const moved = state.questions.map(item => item.listaId === id ? { ...item, listaId: GENERAL_ID } : item);
      if (persist(moved, state.lists.filter(item => item.id !== id))) notify(`Lista excluída. Perguntas movidas para ${generalName}.`);
    }
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
    const incoming = pairs.map(({ pergunta, resposta }) => ({ id: crypto.randomUUID(), listaId: state.currentListId, pergunta, resposta, dificil: false, muitoDificil: false, criadaEm: now, atualizadaEm: now }));
    if (persist([...incoming, ...state.questions])) {
      $('batchDialog').close();
      notify(`${incoming.length} pergunta${incoming.length === 1 ? '' : 's'} adicionada${incoming.length === 1 ? '' : 's'}.`);
    }
  }

  function confirmAction(title, message, acceptLabel = 'Apagar') {
    return new Promise(resolve => {
      const dialog = $('confirmDialog');
      $('confirmTitle').textContent = title;
      $('confirmText').textContent = message;
      $('confirmAccept').textContent = acceptLabel;
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
    updateDifficultButton($('studyDifficult'), item.dificil, true);
    $('studyVery').hidden = !item.dificil;
    updateVeryButton($('studyVery'), item.muitoDificil, true);
    $('studyAnswerBlock').hidden = !state.studyRevealed;
    $('studyReveal').textContent = state.studyRevealed ? 'Ocultar resposta' : 'Mostrar resposta';
    $('studyReveal').setAttribute('aria-expanded', String(state.studyRevealed));
    $('studyPrevious').disabled = state.studyIndex === 0;
    $('studyNext').disabled = state.studyIndex === state.studyIds.length - 1;
  }

  function startStudy() {
    state.studyIds = visibleQuestions().map(item => item.id);
    if (!state.studyIds.length) return;
    state.studyIndex = 0;
    state.studyRevealed = false;
    renderStudy();
    $('studyDialog').showModal();
  }

  function exportBackup() {
    const data = { version: 2, exportadoEm: new Date().toISOString(), listas: state.lists, perguntas: state.questions };
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
      if (!data || ![1, 2].includes(data.version) || !Array.isArray(data.perguntas) || !data.perguntas.every(validQuestion) || (data.version === 2 && (!Array.isArray(data.listas) || !data.listas.every(list => list && typeof list.id === 'string' && typeof list.nome === 'string' && list.nome.trim() && list.nome.length <= 60)))) throw new Error('Formato inválido');
      if (!data.perguntas.length && (data.version === 1 || !data.listas.length)) { notify('O backup não contém perguntas ou listas.'); return; }
      const nextLists = [...state.lists];
      const listIds = new Map([[GENERAL_ID, GENERAL_ID]]);
      if (data.version === 2) {
        for (const list of data.listas) {
          const name = list.nome.trim();
          const existing = nextLists.find(item => item.id !== GENERAL_ID && item.nome.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
          const id = list.id === GENERAL_ID ? GENERAL_ID : existing?.id || crypto.randomUUID();
          listIds.set(list.id, id);
          if (!nextLists.some(item => item.id === id)) {
            let uniqueName = name;
            let suffix = 1;
            while (nextLists.some(item => item.nome.toLocaleLowerCase('pt-BR') === uniqueName.toLocaleLowerCase('pt-BR'))) {
              const ending = suffix === 1 ? ' (importada)' : ` (importada ${suffix})`;
              uniqueName = `${name.slice(0, 60 - ending.length)}${ending}`;
              suffix++;
            }
            nextLists.push({ id, nome: uniqueName });
          }
        }
      }
      const existingIds = new Set(state.questions.map(item => item.id));
      const incoming = data.perguntas.map(normalizeQuestion).map(item => {
        item.listaId = data.version === 2 ? (listIds.get(item.listaId) || GENERAL_ID) : GENERAL_ID;
        if (existingIds.has(item.id)) item.id = crypto.randomUUID();
        existingIds.add(item.id);
        return item;
      });
      if (persist([...incoming, ...state.questions], nextLists)) notify(`${incoming.length} pergunta${incoming.length === 1 ? '' : 's'} importada${incoming.length === 1 ? '' : 's'}.`);
    } catch (error) {
      notify('Arquivo inválido. Selecione um backup JSON do aplicativo.');
    } finally {
      $('importInput').value = '';
    }
  }

  function closeMenu() { $('menu').hidden = true; $('menuButton').setAttribute('aria-expanded', 'false'); }

  function setup() {
    load(); render();
    $('newListButton').addEventListener('click', () => openListForm());
    $('listForm').addEventListener('submit', saveListForm);
    $('backButton').addEventListener('click', () => { state.currentListId = null; render(); window.scrollTo(0, 0); });
    $('listOptionsButton').addEventListener('click', () => { $('listOptions').hidden = !$('listOptions').hidden; $('listOptionsButton').setAttribute('aria-expanded', String(!$('listOptions').hidden)); });
    $('renameListButton').addEventListener('click', () => { $('listOptions').hidden = true; openListForm(state.lists.find(list => list.id === state.currentListId)); });
    $('deleteListButton').addEventListener('click', () => { $('listOptions').hidden = true; deleteCurrentList(); });
    $('moveForm').addEventListener('submit', saveMove);
    $('addButton').addEventListener('click', () => openForm());
    $('questionForm').addEventListener('submit', saveForm);
    $('searchInput').addEventListener('input', render);
    $('revealAllButton').addEventListener('click', toggleRevealAll);
    $('shuffleButton').addEventListener('click', () => {
      state.shuffled = !state.shuffled;
      state.displayIds = state.shuffled ? shuffle(visibleQuestions().map(item => item.id)) : [];
      $('shuffleButton').setAttribute('aria-pressed', String(state.shuffled));
      render();
    });
    $('studyButton').addEventListener('click', () => state.questions.some(item => item.listaId === state.currentListId) ? startStudy() : openForm());
    for (const [id, filter] of [['filterAll', 'all'], ['filterDifficult', 'difficult'], ['filterVery', 'very']]) {
      $(id).addEventListener('click', () => { state.filter = filter; render(); });
    }
    $('studyDifficult').addEventListener('click', () => toggleDifficult(state.studyIds[state.studyIndex], true));
    $('studyVery').addEventListener('click', () => toggleVeryDifficult(state.studyIds[state.studyIndex], true));
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
    document.addEventListener('click', event => { if (!$('listOptions').contains(event.target) && !$('listOptionsButton').contains(event.target)) { $('listOptions').hidden = true; $('listOptionsButton').setAttribute('aria-expanded', 'false'); } });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
    $('exportButton').addEventListener('click', () => { closeMenu(); exportBackup(); });
    $('importButton').addEventListener('click', () => { closeMenu(); $('importInput').click(); });
    $('importInput').addEventListener('change', event => importBackup(event.target.files[0]));
    $('aboutButton').addEventListener('click', () => { closeMenu(); $('aboutDialog').showModal(); });
    $('deleteAllButton').addEventListener('click', async () => { closeMenu(); if (!state.questions.length && state.lists.length === 1) { notify('Não há dados para apagar.'); return; } if (await confirmAction('Apagar todos os dados?', 'Todas as listas e perguntas deste navegador serão apagadas. Geral ficará vazia. Exporte um backup antes, se quiser guardá-las.', 'Apagar tudo')) { if (persist([], [{ id: GENERAL_ID, nome: 'Geral' }])) { state.currentListId = null; render(); notify('Listas e perguntas apagadas.'); } } });
    window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; $('installButton').hidden = false; });
    $('installButton').addEventListener('click', async () => { closeMenu(); if (state.installPrompt) { await state.installPrompt.prompt(); state.installPrompt = null; $('installButton').hidden = true; } });
    window.addEventListener('appinstalled', () => { state.installPrompt = null; $('installButton').hidden = true; });
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  setup();
})();
