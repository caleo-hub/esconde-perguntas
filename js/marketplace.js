(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const pageSize = 12;
  const state = { detail: null, search: '', cursor: null, hasMore: false, loading: false, searchTimer: null };

  function normalize(value) {
    return (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
  }

  function dateText(value) {
    const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date) : '';
  }

  function setStatus(text = '') { $('catalogStatus').textContent = text; }

  function updateAccountUI() {
    const app = window.App;
    const user = app?.getState().user;
    $('accountButton').textContent = user ? '' : 'Entrar';
    $('accountButton').hidden = Boolean(user);
    $('menuButton').hidden = !user;
    $('navMyLists').hidden = !user;
    $('importButton').hidden = !user;
    $('exportButton').hidden = !user;
    $('signOutButton').hidden = !user;
    $('deleteAllButton').hidden = !user;
    $('myPublicationsButton').hidden = !user;
    $('publishListButton').hidden = !user;
    $('moderationButton').hidden = true;
    if (user) {
      FirebaseCloud.marketplace.isModerator(user.uid).then(isModerator => { $('moderationButton').hidden = !isModerator; }).catch(() => {});
    }
  }

  function makeCard(item) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'catalog-card';
    const title = document.createElement('h2');
    title.textContent = item.titulo || 'Lista sem título';
    const description = document.createElement('p');
    description.textContent = item.descricao || 'Sem descrição.';
    const meta = document.createElement('span');
    meta.className = 'catalog-meta';
    meta.textContent = `${item.autorApelido || 'Pessoa da comunidade'} · ${item.quantidade || 0} perguntas · ${dateText(item.publishedAt)}`;
    button.append(title, description, meta);
    button.addEventListener('click', () => openPublication(item.id));
    return button;
  }

  async function showCatalog(reset = false) {
    if (state.loading) return;
    const search = normalize($('catalogSearch').value);
    if (reset || search !== state.search) {
      state.search = search;
      state.cursor = null;
      state.hasMore = false;
      $('catalogCards').replaceChildren();
      $('catalogEmpty').hidden = true;
    } else if (!state.hasMore) return;
    state.loading = true;
    $('catalogMore').disabled = true;
    $('catalogMore').hidden = true;
    setStatus('Carregando listas…');
    try {
      const page = await FirebaseCloud.marketplace.listCatalog({ search: state.search, cursor: state.cursor, limit: pageSize });
      $('catalogCards').append(...page.items.map(makeCard));
      state.cursor = page.cursor;
      state.hasMore = page.hasMore;
      $('catalogEmpty').hidden = $('catalogCards').children.length > 0;
      $('catalogEmptyTitle').textContent = state.search ? 'Nenhuma lista encontrada' : 'Ainda não há listas publicadas';
      $('catalogEmptyText').textContent = state.search ? 'Tente outro início de título.' : 'Volte mais tarde para explorar as listas da comunidade.';
      setStatus($('catalogCards').children.length ? '' : 'Nenhuma publicação aprovada para mostrar.');
      $('catalogMore').hidden = !state.hasMore;
      $('catalogMore').textContent = 'Carregar mais';
    } catch (error) {
      setStatus(navigator.onLine ? 'Não foi possível carregar o catálogo. Tente novamente.' : 'O catálogo precisa de conexão com a internet.');
      $('catalogMore').hidden = false;
      $('catalogMore').textContent = 'Tentar novamente';
      state.hasMore = true;
    } finally {
      state.loading = false;
      $('catalogMore').disabled = false;
      if (normalize($('catalogSearch').value) !== state.search) showCatalog(true);
    }
  }

  function searchChanged() {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => showCatalog(true), 250);
  }

  function setDetailUrl(id) {
    const url = new URL(location.href);
    url.searchParams.set('catalogo', id);
    history.replaceState(null, '', url);
  }

  async function openPublication(id) {
    try {
      const publication = await FirebaseCloud.marketplace.getPublication(id);
      if (!publication) throw new Error('Esta publicação não está disponível.');
      state.detail = publication;
      setDetailUrl(id);
      App.showPage('catalogDetail');
      $('catalogDetailTitle').textContent = publication.titulo;
      $('catalogDetailDescription').textContent = publication.descricao || '';
      $('catalogDetailMeta').textContent = `${publication.autorApelido} · ${publication.perguntas.length} perguntas · ${dateText(publication.publishedAt)}`;
      const knownCopy = App.getState().lists.find(list => list.origemPublicacaoId === id);
      $('copyPublicationButton').textContent = knownCopy ? 'Abrir minha cópia' : 'Copiar para minhas listas';
      $('copyPublicationButton').disabled = !navigator.onLine;
      $('reportPublicationButton').hidden = App.getState().user?.uid === publication.ownerUid;
      $('catalogQuestionList').replaceChildren(...publication.perguntas.map((item, index) => createReadCard(item, index)));
    } catch (error) {
      App.notify(error.message || 'Não foi possível abrir esta lista.');
      history.replaceState(null, '', location.pathname);
      App.showPage('catalog');
    }
  }

  function createReadCard(item, index) {
    const card = document.createElement('article');
    card.className = 'question-card';
    const number = document.createElement('div');
    number.className = 'card-number';
    number.textContent = String(index + 1).padStart(2, '0');
    const question = document.createElement('h3');
    question.textContent = item.pergunta;
    const answer = document.createElement('p');
    answer.className = 'card-answer';
    answer.textContent = item.resposta;
    answer.hidden = true;
    const reveal = document.createElement('button');
    reveal.type = 'button';
    reveal.className = 'reveal-button';
    reveal.textContent = 'Mostrar resposta';
    reveal.setAttribute('aria-expanded', 'false');
    reveal.addEventListener('click', () => {
      answer.hidden = !answer.hidden;
      reveal.textContent = answer.hidden ? 'Mostrar resposta' : 'Ocultar resposta';
      reveal.setAttribute('aria-expanded', String(!answer.hidden));
    });
    card.append(number, question, answer, reveal);
    return card;
  }

  async function copyPublication() {
    const publication = state.detail;
    const account = App.getState();
    if (!publication || !account.user) return;
    const existing = account.lists.find(list => list.origemPublicacaoId === publication.id);
    if (existing) { App.openList(existing.id); return; }
    if (!navigator.onLine) { App.notify('Conecte-se à internet para copiar esta lista.'); return; }
    $('copyPublicationButton').disabled = true;
    try {
      const id = crypto.randomUUID();
      const name = publication.titulo.slice(0, 60);
      const list = { id, nome: name, origemPublicacaoId: publication.id, origemAutorApelido: publication.autorApelido, origemVersao: publication.versao };
      const now = new Date().toISOString();
      const copied = publication.perguntas.map(item => ({
        id: crypto.randomUUID(), listaId: id, pergunta: item.pergunta, resposta: item.resposta,
        dificil: false, muitoDificil: false, ordem: item.ordem,
        criadaEm: now, atualizadaEm: now
      }));
      const lists = [...account.lists, list];
      const questions = [...account.questions, ...copied];
      await FirebaseCloud.saveDelta(lists, questions);
      if (!App.persist(questions, lists, false)) throw new Error('A lista foi copiada na conta, mas não coube no armazenamento local deste aparelho.');
      $('copyPublicationButton').textContent = 'Abrir minha cópia';
      App.notify('Lista copiada para seus estudos.');
      App.openList(id);
    } catch (error) {
      App.notify(error.message || 'Não foi possível copiar a lista. Tente novamente.');
      $('copyPublicationButton').disabled = false;
    }
  }

  async function sharePublication() {
    if (!state.detail) return;
    const url = new URL(location.href);
    url.searchParams.set('catalogo', state.detail.id);
    try {
      if (navigator.share) await navigator.share({ title: state.detail.titulo, url: url.href });
      else { await navigator.clipboard.writeText(url.href); App.notify('Link copiado.'); }
    } catch (error) {
      if (error.name !== 'AbortError') App.notify('Não foi possível compartilhar o link.');
    }
  }

  async function openPublishForm(publication = null) {
    await App.refreshAccount();
    const account = App.getState();
    const list = account.lists.find(item => item.id === account.currentListId);
    if (!list) { App.notify('Abra uma lista sua antes de publicar.'); return; }
    const questions = account.questions.filter(item => item.listaId === list.id).sort((a, b) => a.ordem - b.ordem);
    if (!questions.length) { App.notify('Adicione perguntas antes de publicar.'); return; }
    if (questions.length > 200) { App.notify('Esta lista tem mais de 200 perguntas. Divida-a para publicar.'); return; }
    $('publishForm').reset();
    $('publishError').hidden = true;
    $('publishVerifyButton').hidden = account.user.emailVerified;
    $('publishListSummary').textContent = `${list.nome} · ${questions.length} perguntas. A prévia não inclui suas marcações pessoais de dificuldade.`;
    $('publishTitle').value = publication?.titulo || list.nome;
    $('publishDescription').value = publication?.descricao || '';
    $('publishAlias').value = publication?.autorApelido || localStorage.getItem(`escondePerguntas:marketAlias:${account.user.uid}`) || '';
    $('publishPreview').replaceChildren(...questions.slice(0, 3).map((item, index) => {
      const preview = document.createElement('article');
      const question = document.createElement('strong'); question.textContent = `${index + 1}. ${item.pergunta}`;
      const answer = document.createElement('span'); answer.textContent = item.resposta;
      preview.append(question, answer); return preview;
    }));
    $('publishPreview').setAttribute('aria-label', `Prévia das primeiras ${Math.min(3, questions.length)} perguntas`);
    $('publishDialog').dataset.targetPublicationId = publication?.id || '';
    $('publishDialog').dataset.sourceListId = list.id;
    $('publishSubmit').disabled = !account.user.emailVerified;
    if (!account.user.emailVerified) $('publishError').textContent = 'Confirme seu e-mail antes de enviar uma lista.';
    $('publishError').hidden = account.user.emailVerified;
    $('publishDialog').showModal();
  }

  function validateSubmission(questions) {
    if (questions.length < 1 || questions.length > 200) return 'A lista precisa ter de 1 a 200 perguntas.';
    if (questions.some(item => item.pergunta.length > 1000 || item.resposta.length > 4000)) return 'Cada pergunta pode ter até 1.000 caracteres e cada resposta até 4.000.';
    const size = new TextEncoder().encode(JSON.stringify(questions.map((item, ordem) => ({ pergunta: item.pergunta, resposta: item.resposta, ordem })))).length;
    if (size > 750 * 1024) return 'O conteúdo passa de 750 KiB. Divida a lista em partes menores.';
    return '';
  }

  async function submitPublication(event) {
    event.preventDefault();
    const account = App.getState();
    await App.refreshAccount();
    const user = FirebaseCloud.auth.currentUser;
    const sourceListId = $('publishDialog').dataset.sourceListId;
    const list = App.getState().lists.find(item => item.id === sourceListId);
    const questions = App.getState().questions.filter(item => item.listaId === sourceListId).sort((a, b) => a.ordem - b.ordem);
    const title = $('publishTitle').value.trim();
    const alias = $('publishAlias').value.trim();
    const validation = !user?.emailVerified ? 'Confirme seu e-mail antes de enviar uma lista.'
      : !title || title.length > 60 ? 'Digite um título de até 60 caracteres.'
      : !alias || alias.length > 40 ? 'Digite um apelido público de até 40 caracteres.'
      : !list ? 'A lista não está mais disponível.'
      : validateSubmission(questions);
    if (validation) { $('publishError').textContent = validation; $('publishError').hidden = false; $('publishVerifyButton').hidden = Boolean(user?.emailVerified); $('publishSubmit').disabled = Boolean(!user?.emailVerified); return; }
    if (!$('publishConsent').checked) { $('publishError').textContent = 'Marque a confirmação de compartilhamento para continuar.'; $('publishError').hidden = false; return; }
    $('publishSubmit').disabled = true;
    try {
      await FirebaseCloud.marketplace.submitList(user.uid, {
        sourceListId, targetPublicationId: $('publishDialog').dataset.targetPublicationId,
        titulo: title, descricao: $('publishDescription').value.trim(), autorApelido: alias, perguntas
      });
      localStorage.setItem(`escondePerguntas:marketAlias:${user.uid}`, alias);
      $('publishDialog').close();
      App.notify('Lista enviada. Ela aparecerá no catálogo depois da aprovação.');
    } catch (error) {
      $('publishError').textContent = error.message || 'Não foi possível enviar. Tente novamente quando estiver online.';
      $('publishError').hidden = false;
    } finally { $('publishSubmit').disabled = false; }
  }

  async function showMyPublications() {
    const user = FirebaseCloud.auth.currentUser;
    if (!user) return;
    $('myPublicationsList').replaceChildren();
    $('myPublicationsEmpty').hidden = true;
    try {
      const [publications, ownSubmissions] = await Promise.all([
        FirebaseCloud.marketplace.getOwnPublications(user.uid),
        FirebaseCloud.marketplace.getOwnSubmissions(user.uid)
      ]);
      const cards = [];
      for (const publication of publications) {
        const card = document.createElement('article'); card.className = 'catalog-card';
        const title = document.createElement('h3'); title.textContent = publication.titulo;
        const status = document.createElement('p'); status.textContent = publication.status === 'active' ? `${publication.quantidade} perguntas · Publicada em ${dateText(publication.publishedAt)}` : publication.status === 'withdrawn' ? 'Retirada por você' : 'Ocultada pela moderação';
        const actions = document.createElement('div'); actions.className = 'catalog-card-actions';
        if (publication.status === 'active' || publication.status === 'withdrawn') {
          if (publication.status === 'active') {
            const view = document.createElement('button'); view.type = 'button'; view.className = 'secondary-button'; view.textContent = 'Abrir'; view.addEventListener('click', () => openPublication(publication.id));
            actions.append(view);
          }
          const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'secondary-button'; edit.textContent = publication.status === 'active' ? 'Enviar nova versão' : 'Enviar para republicação'; edit.addEventListener('click', () => {
            if (!App.getState().lists.some(list => list.id === publication.sourceListId)) { App.notify('A lista original não está nesta conta. Importe o backup antes de enviar uma nova versão.'); return; }
            App.openList(publication.sourceListId);
            openPublishForm(publication);
          });
          if (publication.status === 'active') {
            const withdraw = document.createElement('button'); withdraw.type = 'button'; withdraw.className = 'text-button'; withdraw.textContent = 'Retirar'; withdraw.addEventListener('click', async () => {
              if (confirm('Retirar esta lista do catálogo? As cópias de outras pessoas continuarão nos estudos delas.')) {
                try { await FirebaseCloud.marketplace.withdrawPublication(publication.id, user.uid); showMyPublications(); App.notify('Publicação retirada.'); } catch (error) { App.notify(error.message); }
              }
            });
            actions.append(withdraw);
          }
          actions.append(edit);
        }
        card.append(title, status, actions); cards.push(card);
      }
      for (const submission of ownSubmissions) {
        const card = document.createElement('article'); card.className = 'catalog-card';
        const title = document.createElement('h3'); title.textContent = submission.titulo;
        const status = document.createElement('p'); status.textContent = submission.status === 'pending' ? 'Em análise pela equipe.' : submission.status === 'rejected' ? `Rejeitada: ${submission.rejectionReason || 'sem observação'}` : submission.status === 'cancelled' ? 'Envio cancelado.' : 'Aprovada.';
        card.append(title, status);
        if (submission.status === 'pending') {
          const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'text-button'; cancel.textContent = 'Cancelar envio';
          cancel.addEventListener('click', async () => {
            if (!confirm('Cancelar este envio? Será possível reutilizar o espaço após 24 horas.')) return;
            try { await FirebaseCloud.marketplace.cancelSubmission(submission.id); showMyPublications(); App.notify('Envio cancelado.'); }
            catch (error) { App.notify('Não foi possível cancelar o envio.'); }
          });
          card.append(cancel);
        }
        cards.push(card);
      }
      $('myPublicationsList').replaceChildren(...cards);
      $('myPublicationsEmpty').hidden = cards.length > 0;
    } catch (error) { App.notify('Não foi possível carregar suas publicações.'); }
  }

  function makeModerationCard(submission) {
    const card = document.createElement('article'); card.className = 'moderation-item';
    const title = document.createElement('h3'); title.textContent = submission.titulo;
    const description = document.createElement('p'); description.textContent = `${submission.autorApelido} · ${submission.quantidade} perguntas · UID ${submission.ownerUid}`;
    const summary = document.createElement('p'); summary.textContent = submission.descricao || 'Sem descrição.';
    const details = document.createElement('details');
    const summaryLabel = document.createElement('summary'); summaryLabel.textContent = 'Revisar todas as perguntas e respostas';
    const preview = document.createElement('div'); preview.className = 'publish-preview';
    for (const [index, item] of submission.perguntas.entries()) {
      const qa = document.createElement('article'); const question = document.createElement('strong'); question.textContent = `${index + 1}. ${item.pergunta}`; const answer = document.createElement('span'); answer.textContent = item.resposta; qa.append(question, answer); preview.append(qa);
    }
    details.append(summaryLabel, preview);
    const reason = document.createElement('input'); reason.className = 'text-field'; reason.maxLength = 300; reason.placeholder = 'Motivo da rejeição (opcional)';
    const actions = document.createElement('div'); actions.className = 'moderation-item-actions';
    const block = document.createElement('button'); block.type = 'button'; block.className = 'text-button'; block.textContent = 'Bloquear autor';
    block.addEventListener('click', async () => {
      const reasonText = prompt('Motivo do bloqueio para a equipe:') || '';
      if (!confirm(`Bloquear a conta ${submission.ownerUid} para impedir novos envios?`)) return;
      try { await FirebaseCloud.marketplace.blockUser(submission.ownerUid, reasonText); App.notify('Conta bloqueada para novos envios.'); }
      catch (error) { App.notify('Não foi possível bloquear a conta.'); }
    });
    const approve = document.createElement('button'); approve.type = 'button'; approve.className = 'primary-button'; approve.textContent = 'Aprovar';
    approve.addEventListener('click', async () => {
      if (submission.ownerUid === FirebaseCloud.auth.currentUser?.uid) { App.notify('Você não pode aprovar seu próprio envio.'); return; }
      approve.disabled = true;
      try { await FirebaseCloud.marketplace.decideSubmission(submission.id, 'approve'); showModeration(); }
      catch (error) { App.notify(error.message || 'Não foi possível aprovar.'); approve.disabled = false; }
    });
    const reject = document.createElement('button'); reject.type = 'button'; reject.className = 'secondary-button'; reject.textContent = 'Rejeitar';
    reject.addEventListener('click', async () => {
      if (!confirm('Rejeitar este envio?')) return;
      try { await FirebaseCloud.marketplace.decideSubmission(submission.id, 'reject', reason.value); showModeration(); }
      catch (error) { App.notify(error.message || 'Não foi possível rejeitar.'); }
    });
    actions.append(block, approve, reject);
    card.append(title, description, summary, details, reason, actions);
    return card;
  }

  async function showModeration() {
    const user = FirebaseCloud.auth.currentUser;
    if (!user || !user.emailVerified || !await FirebaseCloud.marketplace.isModerator(user.uid)) {
      App.notify('Esta área é exclusiva da equipe de moderação.');
      App.showPage('home');
      return;
    }
    $('moderationQueue').replaceChildren();
    $('moderationReports').replaceChildren();
    try {
      const queue = await FirebaseCloud.marketplace.getModerationQueue();
      $('moderationQueue').replaceChildren(...queue.submissions.map(makeModerationCard));
      $('moderationReports').replaceChildren(...queue.reports.map(makeReportCard));
    } catch (error) { App.notify('Não foi possível abrir a fila de moderação.'); }
  }

  function makeReportCard(report) {
    const card = document.createElement('article'); card.className = 'moderation-item';
    const title = document.createElement('h3'); title.textContent = `Denúncia · ${report.reason}`;
    const details = document.createElement('p'); details.textContent = `${report.note || 'Sem detalhes adicionais.'} · Publicação ${report.publicationId} · UID ${report.reporterUid}`;
    const actions = document.createElement('div'); actions.className = 'moderation-item-actions';
    const hide = document.createElement('button'); hide.type = 'button'; hide.className = 'danger-button'; hide.textContent = 'Ocultar publicação';
    hide.addEventListener('click', async () => {
      const reason = prompt('Motivo da ocultação para a equipe:') || '';
      try { await FirebaseCloud.marketplace.hidePublication(report.publicationId, reason); await FirebaseCloud.marketplace.resolveReport(report.id, 'resolved', reason); showModeration(); }
      catch (error) { App.notify(error.message || 'Não foi possível ocultar.'); }
    });
    const resolve = document.createElement('button'); resolve.type = 'button'; resolve.className = 'secondary-button'; resolve.textContent = 'Marcar como resolvida';
    resolve.addEventListener('click', async () => { try { await FirebaseCloud.marketplace.resolveReport(report.id, 'resolved'); showModeration(); } catch (error) { App.notify('Não foi possível atualizar a denúncia.'); } });
    const dismiss = document.createElement('button'); dismiss.type = 'button'; dismiss.className = 'text-button'; dismiss.textContent = 'Não procede';
    dismiss.addEventListener('click', async () => { try { await FirebaseCloud.marketplace.resolveReport(report.id, 'dismissed'); showModeration(); } catch (error) { App.notify('Não foi possível atualizar a denúncia.'); } });
    actions.append(hide, resolve, dismiss); card.append(title, details, actions); return card;
  }

  async function openReport() {
    await App.refreshAccount();
    const user = FirebaseCloud.auth.currentUser;
    $('reportError').hidden = true;
    $('reportVerifyButton').hidden = Boolean(user?.emailVerified);
    $('reportDialog').showModal();
  }

  async function submitReport(event) {
    event.preventDefault();
    const user = FirebaseCloud.auth.currentUser;
    if (!user?.emailVerified) { $('reportError').textContent = 'Confirme seu e-mail antes de denunciar.'; $('reportError').hidden = false; $('reportVerifyButton').hidden = false; return; }
    if (!state.detail) return;
    try {
      await FirebaseCloud.marketplace.reportPublication(state.detail.id, user.uid, $('reportReason').value, $('reportNote').value.trim());
      $('reportDialog').close(); App.notify('Denúncia enviada para a equipe.');
    } catch (error) { $('reportError').textContent = error.message || 'Não foi possível enviar a denúncia.'; $('reportError').hidden = false; }
  }

  async function sendVerification() {
    try { await FirebaseCloud.sendVerificationEmail(); App.notify('Enviamos um link de confirmação para seu e-mail.'); }
    catch (error) { App.notify('Não foi possível enviar o link. Tente novamente mais tarde.'); }
  }

  window.Marketplace = {
    updateAccountUI, showCatalog, searchChanged, openPublication, copyPublication,
    sharePublication, openPublishForm, submitPublication, showMyPublications,
    showModeration, openReport, submitReport, sendVerification
  };
})();
