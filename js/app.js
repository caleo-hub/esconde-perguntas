(() => {
  'use strict';

  const STORAGE_KEY = 'escondePerguntas';
  const GENERAL_ID = 'geral';
  const $ = id => document.getElementById(id);
  const state = { questions: [], lists: [{ id: GENERAL_ID, nome: 'Geral' }], currentListId: null, filter: 'all', revealedIds: new Set(), shuffled: false, displayIds: [], studyIds: [], studyRevealedIds: new Set(), installPrompt: null, user: null, storageKey: STORAGE_KEY, authMode: 'login', importLegacyOnLogin: false };
  let toastTimer;

  function accountStorageKey() { return state.user ? `${STORAGE_KEY}:${state.user.uid}` : STORAGE_KEY; }

  function validQuestion(item) {
    return item && typeof item === 'object' && typeof item.pergunta === 'string' && typeof item.resposta === 'string' && item.pergunta.trim() && item.resposta.trim() && item.pergunta.length <= 2000 && item.resposta.length <= 10000;
  }

  function normalizeQuestion(item) {
    const now = new Date().toISOString();
    return { id: typeof item.id === 'string' && item.id ? item.id : crypto.randomUUID(), listaId: typeof item.listaId === 'string' ? item.listaId : GENERAL_ID, pergunta: item.pergunta.trim(), resposta: item.resposta.trim(), dificil: item.dificil === true || item.muitoDificil === true, muitoDificil: item.muitoDificil === true, criadaEm: typeof item.criadaEm === 'string' ? item.criadaEm : now, atualizadaEm: typeof item.atualizadaEm === 'string' ? item.atualizadaEm : now };
  }

  function withQuestionOrder(questions) {
    return questions.map((item, index) => item.ordem === index ? item : { ...item, ordem: index });
  }

  function notify(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
  }

  function load(key = accountStorageKey()) {
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      const legacy = Array.isArray(stored);
      if (!legacy && (!stored || stored.version !== 2 || !Array.isArray(stored.listas) || !Array.isArray(stored.perguntas))) throw new Error('Formato inválido');
      const lists = legacy ? [] : stored.listas.filter(item => item && typeof item.id === 'string' && typeof item.nome === 'string' && item.nome.trim()).map(item => ({ id: item.id, nome: item.nome.trim(), ...(typeof item.origemPublicacaoId === 'string' ? { origemPublicacaoId: item.origemPublicacaoId } : {}), ...(typeof item.origemAutorApelido === 'string' ? { origemAutorApelido: item.origemAutorApelido } : {}), ...(Number.isSafeInteger(item.origemVersao) ? { origemVersao: item.origemVersao } : {}) }));
      state.lists = [{ id: GENERAL_ID, nome: lists.find(item => item.id === GENERAL_ID)?.nome || 'Geral' }, ...lists.filter(item => item.id !== GENERAL_ID)];
      const validIds = new Set(state.lists.map(item => item.id));
      state.questions = withQuestionOrder((legacy ? stored : stored.perguntas).filter(validQuestion).map(normalizeQuestion).map(item => validIds.has(item.listaId) ? item : { ...item, listaId: GENERAL_ID }));
      if (legacy && localStorage.getItem(key) !== null) {
        try { localStorage.setItem(key, JSON.stringify({ version: 2, listas: state.lists, perguntas: state.questions })); }
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
      const ordered = withQuestionOrder(next);
      localStorage.setItem(accountStorageKey(), JSON.stringify({ version: 2, listas: nextLists, perguntas: ordered }));
      state.questions = ordered;
      state.lists = nextLists;
      render();
      if (state.user) FirebaseCloud.saveDelta(nextLists, ordered).catch(() => notify('Salvo neste aparelho. A sincronização será tentada quando a conexão voltar.'));
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

  function updateShuffleButton(visibleCount) {
    const button = $('shuffleButton');
    button.innerHTML = state.shuffled ? '<span aria-hidden="true">↺</span> Ordem normal' : '<span aria-hidden="true">⇄</span> Embaralhar';
    button.setAttribute('aria-pressed', String(state.shuffled));
    button.setAttribute('aria-label', state.shuffled ? 'Desembaralhar perguntas e voltar à ordem normal' : 'Embaralhar perguntas exibidas');
    button.disabled = !state.shuffled && visibleCount < 2;
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
    if (fromStudy) updateStudyDifficulty(id);
    else focusCardDifficulty(id, '.difficult-button', 'filterDifficult');
  }

  function toggleVeryDifficult(id, fromStudy = false) {
    const item = state.questions.find(question => question.id === id);
    if (!item?.dificil) return;
    if (!persist(state.questions.map(question => question.id === id ? { ...question, muitoDificil: !question.muitoDificil, atualizadaEm: new Date().toISOString() } : question))) return;
    if (fromStudy) updateStudyDifficulty(id);
    else focusCardDifficulty(id, '.very-button', 'filterVery');
  }

  function focusCardDifficulty(id, selector, fallbackId) {
    const card = [...$('questionList').children].find(element => element.dataset.id === id);
    (card?.querySelector(selector) || $(fallbackId)).focus({ preventScroll: true });
  }

  function updateStudyDifficulty(id) {
    const item = state.questions.find(question => question.id === id);
    const card = [...$('studyList').children].find(element => element.dataset.id === id);
    if (!item || !card) return;
    updateDifficultButton(card.querySelector('.difficult-button'), item.dificil);
    const very = card.querySelector('.very-button');
    very.hidden = !item.dificil;
    updateVeryButton(very, item.muitoDificil);
  }

  function openList(id) {
    if (!state.lists.some(list => list.id === id)) return;
    state.currentListId = id;
    state.filter = 'all';
    state.shuffled = false;
    state.displayIds = [];
    $('searchInput').value = '';
    $('listOptions').hidden = true;
    $('listOptionsButton').setAttribute('aria-expanded', 'false');
    render();
    window.scrollTo(0, 0);
  }

  function renderHome() {
    const repeated = QuestionDedup.compact(state.questions).removed;
    $('duplicateNotice').hidden = repeated === 0;
    $('duplicateNoticeText').textContent = `Encontramos ${repeated} pergunta${repeated === 1 ? '' : 's'} repetida${repeated === 1 ? '' : 's'} com a mesma pergunta e resposta dentro da mesma lista. As marcações de dificuldade serão preservadas.`;
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
    $('verifyEmailButton').hidden = !state.user || state.user.emailVerified;
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
    updateShuffleButton(visible.length);
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

  function createCard(item, index, inStudy = false) {
    const card = document.createElement('article');
    card.className = 'question-card';
    card.dataset.id = item.id;
    const top = document.createElement('div');
    top.className = 'card-top';
    const number = document.createElement('span');
    number.className = 'card-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const difficult = document.createElement('button');
    difficult.type = 'button';
    difficult.className = 'difficult-button';
    updateDifficultButton(difficult, item.dificil);
    difficult.addEventListener('click', () => toggleDifficult(item.id, inStudy));
    const very = document.createElement('button');
    very.type = 'button';
    very.className = 'very-button';
    very.hidden = !item.dificil;
    updateVeryButton(very, item.muitoDificil);
    very.addEventListener('click', () => toggleVeryDifficult(item.id, inStudy));
    actions.append(difficult, very);
    top.append(number, actions);
    if (!inStudy) {
      const menuButton = document.createElement('button');
      menuButton.className = 'card-menu-button';
      menuButton.type = 'button';
      menuButton.setAttribute('aria-label', 'Opções da pergunta');
      menuButton.setAttribute('aria-expanded', 'false');
      menuButton.textContent = '⋮';
      actions.append(menuButton);
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
      card.append(top, menu);
    } else card.append(top);
    const title = document.createElement('h3');
    title.textContent = item.pergunta;
    const answer = document.createElement('div');
    answer.className = 'card-answer'; answer.hidden = !(inStudy ? state.studyRevealedIds : state.revealedIds).has(item.id);
    const label = document.createElement('div');
    label.className = 'eyebrow'; label.textContent = 'RESPOSTA';
    const content = document.createElement('p');
    content.textContent = item.resposta;
    answer.append(label, content);
    const reveal = document.createElement('button');
    reveal.className = 'reveal-button'; reveal.type = 'button'; reveal.textContent = answer.hidden ? 'Mostrar resposta' : 'Ocultar resposta';
    reveal.setAttribute('aria-expanded', String(!answer.hidden));
    reveal.addEventListener('click', () => {
      const revealedIds = inStudy ? state.studyRevealedIds : state.revealedIds;
      answer.hidden = !answer.hidden;
      if (answer.hidden) revealedIds.delete(item.id); else revealedIds.add(item.id);
      reveal.textContent = answer.hidden ? 'Mostrar resposta' : 'Ocultar resposta';
      reveal.setAttribute('aria-expanded', String(!answer.hidden));
      if (!inStudy) updateRevealAllButton();
    });
    card.append(title, answer, reveal);
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
    const listId = existing?.listaId || state.currentListId;
    const key = QuestionDedup.pairKey({ pergunta, resposta }, listId);
    if (state.questions.some(item => item.id !== id && QuestionDedup.pairKey(item) === key)) {
      $('formError').textContent = 'Esta pergunta e resposta já estão nesta lista.';
      $('formError').hidden = false;
      return;
    }
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
    const source = state.questions.find(item => item.id === id);
    if (!state.lists.some(list => list.id === target) || !source) return;
    const key = QuestionDedup.pairKey(source, target);
    if (state.questions.some(item => item.id !== id && QuestionDedup.pairKey(item) === key)) {
      notify('Esta pergunta e resposta já estão na lista de destino.');
      return;
    }
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
    const { unique, skipped } = QuestionDedup.filterIncoming(pairs, state.questions, state.currentListId);
    $('batchPreview').textContent = `${unique.length} pergunta${unique.length === 1 ? '' : 's'} nova${unique.length === 1 ? '' : 's'}${skipped ? ` · ${skipped} repetida${skipped === 1 ? '' : 's'} ignorada${skipped === 1 ? '' : 's'}` : ''}${errors ? ` · ${errors} incompleto${errors === 1 ? '' : 's'}` : ''}.`;
    $('batchSave').disabled = !unique.length || !!errors || pairs.length > 500;
    $('batchError').hidden = true;
  }

  function saveBatch(event) {
    event.preventDefault();
    const { pairs, errors } = parseBatch($('batchField').value);
    const { unique, skipped } = QuestionDedup.filterIncoming(pairs, state.questions, state.currentListId);
    if (!unique.length || errors || pairs.length > 500) {
      $('batchError').textContent = pairs.length > 500 ? 'Importe até 500 perguntas por vez.' : errors ? 'Confira os pares incompletos antes de adicionar.' : 'Todas as perguntas já estão nesta lista.';
      $('batchError').hidden = false;
      return;
    }
    const now = new Date().toISOString();
    const incoming = unique.map(({ pergunta, resposta }) => ({ id: crypto.randomUUID(), listaId: state.currentListId, pergunta, resposta, dificil: false, muitoDificil: false, criadaEm: now, atualizadaEm: now }));
    if (persist([...incoming, ...state.questions])) {
      $('batchDialog').close();
      notify(`${incoming.length} pergunta${incoming.length === 1 ? '' : 's'} adicionada${incoming.length === 1 ? '' : 's'}${skipped ? ` · ${skipped} repetida${skipped === 1 ? '' : 's'} ignorada${skipped === 1 ? '' : 's'}` : ''}.`);
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
    const byId = new Map(state.questions.map(item => [item.id, item]));
    const questions = state.studyIds.map(id => byId.get(id)).filter(Boolean);
    $('studyTitle').textContent = state.lists.find(list => list.id === state.currentListId)?.nome || 'Revisão';
    $('studyCounter').textContent = `${questions.length} pergunta${questions.length === 1 ? '' : 's'} para revisar`;
    $('studyList').replaceChildren(...questions.map((item, index) => createCard(item, index, true)));
  }

  function startStudy() {
    state.studyIds = visibleQuestions().map(item => item.id);
    if (!state.studyIds.length) return;
    state.studyRevealedIds = new Set();
    renderStudy();
    $('studyDialog').showModal();
    $('studyList').scrollTop = 0;
  }

  function exportBackup(suffix = '') {
    const data = { version: 2, exportadoEm: new Date().toISOString(), listas: state.lists, perguntas: state.questions };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `esconde-perguntas-${new Date().toISOString().slice(0, 10)}${suffix}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify('Backup exportado.');
  }

  async function cleanupDuplicates() {
    const { questions, removed } = QuestionDedup.compact(state.questions);
    if (!removed) { notify('Não há perguntas repetidas para limpar.'); return; }
    const agreed = await confirmAction('Limpar perguntas repetidas?', `${removed} cópia${removed === 1 ? '' : 's'} idêntica${removed === 1 ? '' : 's'} será${removed === 1 ? '' : 'ão'} removida${removed === 1 ? '' : 's'}. O app baixará primeiro um backup completo. Perguntas iguais em listas diferentes permanecerão.`, 'Baixar e limpar');
    if (!agreed) return;
    exportBackup('-antes-da-limpeza');
    if (persist(questions)) notify(`${removed} repetida${removed === 1 ? '' : 's'} removida${removed === 1 ? '' : 's'}. Marcações preservadas.`);
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
          const existing = nextLists.find(item => item.id === list.id) || nextLists.find(item => item.id !== GENERAL_ID && item.nome.toLocaleLowerCase('pt-BR') === name.toLocaleLowerCase('pt-BR'));
          const id = list.id === GENERAL_ID ? GENERAL_ID : existing?.id || crypto.randomUUID();
          listIds.set(list.id, id);
          if (id === GENERAL_ID && nextLists[0].nome === 'Geral' && !state.questions.some(item => item.listaId === GENERAL_ID)) nextLists[0] = { id: GENERAL_ID, nome: name };
          if (!nextLists.some(item => item.id === id)) {
            let uniqueName = name;
            let suffix = 1;
            while (nextLists.some(item => item.nome.toLocaleLowerCase('pt-BR') === uniqueName.toLocaleLowerCase('pt-BR'))) {
              const ending = suffix === 1 ? ' (importada)' : ` (importada ${suffix})`;
              uniqueName = `${name.slice(0, 60 - ending.length)}${ending}`;
              suffix++;
            }
            nextLists.push({ id, nome: uniqueName, ...(typeof list.origemPublicacaoId === 'string' ? { origemPublicacaoId: list.origemPublicacaoId } : {}), ...(typeof list.origemAutorApelido === 'string' ? { origemAutorApelido: list.origemAutorApelido } : {}), ...(Number.isSafeInteger(list.origemVersao) ? { origemVersao: list.origemVersao } : {}) });
          }
        }
      }
      const existingIds = new Set(state.questions.map(item => item.id));
      const importedIds = new Set();
      const incoming = data.perguntas.map(normalizeQuestion).map(item => {
        item.listaId = data.version === 2 ? (listIds.get(item.listaId) || GENERAL_ID) : GENERAL_ID;
        if (importedIds.has(item.id)) item.id = crypto.randomUUID();
        importedIds.add(item.id);
        return item;
      });
      const updatedCount = incoming.filter(item => existingIds.has(item.id)).length;
      const remaining = state.questions.filter(item => !importedIds.has(item.id));
      const compacted = QuestionDedup.compact([...incoming, ...remaining]);
      if (persist(compacted.questions, nextLists)) notify(`${incoming.length} pergunta${incoming.length === 1 ? '' : 's'} processada${incoming.length === 1 ? '' : 's'} conforme o backup${updatedCount ? ` · ${updatedCount} atualizada${updatedCount === 1 ? '' : 's'}` : ''}${compacted.removed ? ` · ${compacted.removed} repetida${compacted.removed === 1 ? '' : 's'} ignorada${compacted.removed === 1 ? '' : 's'}` : ''}.`);
    } catch (error) {
      notify('Arquivo inválido. Selecione um backup JSON do aplicativo.');
    } finally {
      $('importInput').value = '';
    }
  }

  function closeMenu() { $('menu').hidden = true; $('menuButton').setAttribute('aria-expanded', 'false'); }

  function mergeById(primary, secondary) {
    const merged = new Map(primary.map(item => [item.id, item]));
    for (const item of secondary) if (!merged.has(item.id)) merged.set(item.id, item);
    return [...merged.values()];
  }

  function cacheCurrentAccount() {
    state.questions = withQuestionOrder(state.questions);
    localStorage.setItem(accountStorageKey(), JSON.stringify({ version: 2, listas: state.lists, perguntas: state.questions }));
  }

  function legacyQuestionCount() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      const questions = Array.isArray(stored) ? stored : stored?.perguntas;
      return Array.isArray(questions) ? questions.filter(validQuestion).length : 0;
    } catch { return 0; }
  }

  function activateAccount(user) {
    state.user = user;
    state.storageKey = accountStorageKey();
    const ownSaved = localStorage.getItem(state.storageKey);
    const hasLegacyData = !ownSaved && state.importLegacyOnLogin && legacyQuestionCount() > 0;
    state.importLegacyOnLogin = false;
    state.questions = [];
    state.lists = [{ id: GENERAL_ID, nome: 'Geral' }];
    load(ownSaved ? state.storageKey : hasLegacyData ? STORAGE_KEY : state.storageKey);
    const localQuestions = [...state.questions];
    const localLists = [...state.lists];
    state.currentListId = null;
    $('authView').hidden = false;
    $('appShell').hidden = true;
    $('authTitle').textContent = 'Carregando seus estudos';
    $('authDescription').textContent = 'Estamos buscando suas listas salvas na sua conta.';
    $('authForm').hidden = true;
    $('authModeButton').hidden = true;
    $('resetPasswordButton').hidden = true;
    const finishLoading = () => { $('authView').hidden = true; $('appShell').hidden = false; };
    FirebaseCloud.watch(user.uid, (remote, initial, error) => {
      if (initial) {
        if (error) {
          state.questions = localQuestions;
          state.lists = localLists;
          cacheCurrentAccount();
          render();
          finishLoading();
          notify('Firebase indisponível. Seus dados seguem neste aparelho até a sincronização ser liberada.');
          return;
        }
        const remoteHasData = remote.questions.length > 0 || remote.lists.some(list => list.id !== GENERAL_ID) || remote.lists.some(list => list.id === GENERAL_ID && list.nome !== 'Geral');
        if (!remoteHasData) {
          state.questions = localQuestions;
          state.lists = localLists;
          if (!state.lists.some(list => list.id === GENERAL_ID)) state.lists.unshift({ id: GENERAL_ID, nome: 'Geral' });
          cacheCurrentAccount();
          FirebaseCloud.saveAll(state.lists, state.questions).then(() => {
            if (hasLegacyData) localStorage.removeItem(STORAGE_KEY);
            notify('Suas perguntas estão salvas e sincronizadas na conta.');
          }).catch(() => notify('Conta conectada. Os dados locais serão sincronizados quando o Firebase estiver configurado.'));
          render();
          finishLoading();
          return;
        }
        const useLegacy = hasLegacyData;
        const localOrder = new Map(localQuestions.map((item, index) => [item.id, index]));
        const recoverLocalOrder = !useLegacy && remote.questions.length > 0 && remote.questions.every(item => !Number.isSafeInteger(item.ordem) && localOrder.has(item.id));
        const remoteQuestions = recoverLocalOrder ? [...remote.questions].sort((a, b) => localOrder.get(a.id) - localOrder.get(b.id)) : remote.questions;
        state.lists = mergeById(remote.lists, useLegacy ? localLists : []);
        if (!state.lists.some(list => list.id === GENERAL_ID)) state.lists.unshift({ id: GENERAL_ID, nome: 'Geral' });
        state.questions = mergeById(remoteQuestions, useLegacy ? localQuestions : []);
        cacheCurrentAccount();
        render();
        finishLoading();
        if (useLegacy || recoverLocalOrder) {
          FirebaseCloud.saveAll(state.lists, state.questions).then(() => {
            if (useLegacy) localStorage.removeItem(STORAGE_KEY);
            notify(useLegacy ? 'Suas perguntas deste aparelho foram adicionadas à conta.' : 'A ordem das suas perguntas foi sincronizada.');
          }).catch(() => notify('Não foi possível sincronizar os dados locais. Eles continuam salvos neste aparelho.'));
        }
        return;
      }
      const latest = JSON.stringify({ lists: state.lists, questions: state.questions });
      const incoming = JSON.stringify({ lists: remote.lists, questions: remote.questions });
      if (latest === incoming) return;
      if (FirebaseCloud.isDirty()) {
        state.lists = mergeById(remote.lists, state.lists);
        state.questions = mergeById(remote.questions, state.questions);
        cacheCurrentAccount();
        render();
        FirebaseCloud.saveAll(state.lists, state.questions).catch(() => {});
        return;
      }
      state.lists = remote.lists;
      state.questions = remote.questions;
      if (!state.lists.some(list => list.id === GENERAL_ID)) state.lists.unshift({ id: GENERAL_ID, nome: 'Geral' });
      cacheCurrentAccount();
      render();
      notify('Perguntas sincronizadas.');
    });
  }

  function setAuthMode(mode) {
    state.authMode = mode;
    const registering = mode === 'register';
    $('authTitle').textContent = registering ? 'Crie sua conta' : 'Entre na sua conta';
    $('authDescription').textContent = registering ? 'Use seu e-mail e uma senha para guardar suas listas na nuvem.' : 'Suas listas ficam salvas e sincronizadas na sua conta.';
    $('authSubmit').textContent = registering ? 'Criar conta' : 'Entrar';
    $('authModeButton').textContent = registering ? 'Já tenho uma conta' : 'Criar uma conta';
    $('confirmPasswordGroup').hidden = !registering;
    const legacyCount = legacyQuestionCount();
    $('legacyImportGroup').hidden = !registering || legacyCount === 0;
    $('legacyImportDescription').textContent = legacyCount === 1
      ? '1 pergunta salva neste aparelho será copiada para sua conta.'
      : `${legacyCount} perguntas salvas neste aparelho serão copiadas para sua conta.`;
    if (!registering) state.importLegacyOnLogin = false;
    $('authPassword').autocomplete = registering ? 'new-password' : 'current-password';
    $('resetPasswordButton').hidden = registering;
    $('authForm').hidden = false;
    $('authModeButton').hidden = false;
    $('authError').hidden = true;
  }

  function showAuthError(error) {
    const messages = {
      'auth/email-already-in-use': 'Este e-mail já tem uma conta. Entre com sua senha.',
      'auth/invalid-email': 'Digite um endereço de e-mail válido.',
      'auth/weak-password': 'Escolha uma senha com pelo menos 6 caracteres.',
      'auth/invalid-credential': 'E-mail ou senha incorretos.',
      'auth/user-not-found': 'Não encontramos uma conta com esse e-mail.',
      'auth/wrong-password': 'Senha incorreta.',
      'auth/operation-not-allowed': 'O acesso por e-mail e senha ainda precisa ser ativado no Firebase Authentication.',
      'auth/unauthorized-domain': 'Este endereço ainda não está autorizado no Firebase Authentication.',
      'auth/network-request-failed': 'Sem conexão com a internet. Tente novamente quando estiver online.'
    };
    $('authError').textContent = messages[error?.code] || 'Não foi possível concluir. Confira os dados e tente novamente.';
    $('authError').hidden = false;
  }

  async function submitAuth(event) {
    event.preventDefault();
    $('authError').hidden = true;
    const email = $('authEmail').value.trim();
    const password = $('authPassword').value;
    try {
      if (state.authMode === 'register') {
        if (password !== $('authPasswordConfirm').value) throw Object.assign(new Error('Senhas diferentes'), { code: 'auth/password-mismatch' });
        state.importLegacyOnLogin = !$('legacyImportGroup').hidden && $('importLegacyQuestions').checked;
        await FirebaseCloud.createAccount(email, password);
        await sendVerificationEmail();
      } else await FirebaseCloud.signIn(email, password);
    } catch (error) { state.importLegacyOnLogin = false; showAuthError(error); }
  }

  async function resetPassword() {
    const email = $('authEmail').value.trim();
    if (!email) { $('authError').textContent = 'Digite seu e-mail para receber o link de redefinição.'; $('authError').hidden = false; $('authEmail').focus(); return; }
    try { await FirebaseCloud.resetPassword(email); notify('Enviamos um link para redefinir sua senha.'); }
    catch (error) { showAuthError(error); }
  }

  async function sendVerificationEmail() {
    const user = FirebaseCloud.auth.currentUser;
    if (!user) { notify('Entre na sua conta para enviar a confirmação.'); return; }
    if (user.emailVerified) { notify('Este e-mail já está confirmado.'); return; }
    try {
      await FirebaseCloud.sendVerificationEmail();
      notify(`Enviamos o link de confirmação para ${user.email}. Confira também a caixa de spam.`);
    } catch (error) {
      const messages = {
        'auth/too-many-requests': 'O Firebase limitou temporariamente os envios. Aguarde e tente novamente.',
        'auth/network-request-failed': 'Sem conexão. Conecte-se à internet e tente reenviar.',
        'auth/user-token-expired': 'Sua sessão expirou. Entre novamente e peça outro link.',
        'auth/unauthorized-continue-uri': 'O domínio do link não está autorizado no Firebase Authentication.',
        'auth/operation-not-allowed': 'O envio de e-mails de confirmação não está habilitado no Firebase Authentication.'
      };
      notify(messages[error?.code] || `O Firebase não enviou o link${error?.code ? ` (${error.code})` : ''}. Tente novamente mais tarde.`);
    }
  }

  function setup() {
    $('authForm').addEventListener('submit', submitAuth);
    $('authModeButton').addEventListener('click', () => setAuthMode(state.authMode === 'login' ? 'register' : 'login'));
    $('resetPasswordButton').addEventListener('click', resetPassword);
    FirebaseCloud.auth.onAuthStateChanged(user => {
      if (user) activateAccount(user);
      else {
        FirebaseCloud.stopSync();
        state.user = null;
        state.questions = [];
        state.lists = [{ id: GENERAL_ID, nome: 'Geral' }];
        state.currentListId = null;
        $('appShell').hidden = true;
        $('authView').hidden = false;
        setAuthMode('login');
      }
    }, error => showAuthError(error));
    $('newListButton').addEventListener('click', () => openListForm());
    $('cleanupDuplicatesButton').addEventListener('click', cleanupDuplicates);
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
      const visibleIds = visibleQuestions().map(item => item.id);
      state.shuffled = !state.shuffled;
      state.displayIds = state.shuffled ? shuffle(visibleIds) : [];
      render();
    });
    $('studyButton').addEventListener('click', () => state.questions.some(item => item.listaId === state.currentListId) ? startStudy() : openForm());
    for (const [id, filter] of [['filterAll', 'all'], ['filterDifficult', 'difficult'], ['filterVery', 'very']]) {
      $(id).addEventListener('click', () => { state.filter = filter; render(); });
    }
    $('batchButton').addEventListener('click', () => { $('batchField').value = ''; updateBatchPreview(); $('batchDialog').showModal(); });
    $('batchField').addEventListener('input', updateBatchPreview);
    $('batchForm').addEventListener('submit', saveBatch);
    $('copyPromptButton').addEventListener('click', async () => {
      const prompt = 'Transforme o texto que vou enviar em uma lista numerada de pares de pergunta e resposta. Use exatamente este formato para cada item: número, ponto, espaço, pergunta em uma linha; resposta na linha seguinte; uma linha vazia entre os itens. Não acrescente introdução, comentários ou perguntas sem resposta. Preserve o conteúdo e não invente respostas.\n\nCole meu texto abaixo:\n';
      try { await navigator.clipboard.writeText(prompt); notify('Prompt copiado. Cole no ChatGPT junto com seu texto.'); }
      catch (error) { notify('Não foi possível copiar. Tente abrir o site por HTTPS.'); }
    });
    $('studyClose').addEventListener('click', () => $('studyDialog').close());
    document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
    $('menuButton').addEventListener('click', () => { $('menu').hidden = !$('menu').hidden; $('menuButton').setAttribute('aria-expanded', String(!$('menu').hidden)); });
    $('signOutButton').addEventListener('click', async () => { closeMenu(); try { await FirebaseCloud.auth.signOut(); } catch (error) { notify('Não foi possível sair da conta.'); } });
    $('verifyEmailButton').addEventListener('click', () => { closeMenu(); sendVerificationEmail(); });
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
