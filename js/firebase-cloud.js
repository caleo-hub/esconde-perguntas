(() => {
  'use strict';

  const app = firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = app.auth();
  const db = app.firestore();
  const appCheckKey = window.FIREBASE_CONFIG.appCheckSiteKey;
  if (appCheckKey && firebase.appCheck) {
    try { firebase.appCheck().activate(new firebase.appCheck.ReCaptchaEnterpriseProvider(appCheckKey), true); }
    catch (error) { console.error('App Check initialization failed:', error); }
  }
  let currentUid = null;
  let listSubscription = null;
  let questionSubscription = null;
  let dirty = false;
  let writeQueue = Promise.resolve();
  let onRemoteChange = null;
  let knownLists = new Map();
  let knownQuestions = new Map();

  try { db.enablePersistence({ synchronizeTabs: true }).catch(() => {}); } catch (error) {}

  function collection(uid, name) {
    return db.collection('users').doc(uid).collection(name);
  }

  const publicLists = db.collection('marketplaceLists');
  const submissions = db.collection('marketplaceSubmissions');
  const reports = db.collection('marketplaceReports');
  const moderators = db.collection('marketplaceModerators');
  const blocks = db.collection('marketplaceBlocks');
  const serverTime = () => firebase.firestore.FieldValue.serverTimestamp();
  const asItem = document => ({ id: document.id, ...document.data() });
  const slotId = (uid, slot) => `${uid}_${slot}`;
  const publicPrefix = value => (value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');

  function validateSubmissionContent(submission) {
    if (typeof submission.titulo !== 'string' || !submission.titulo.trim() || submission.titulo.length > 60
      || typeof submission.descricao !== 'string' || submission.descricao.length > 280
      || typeof submission.autorApelido !== 'string' || !submission.autorApelido.trim() || submission.autorApelido.length > 40
      || !Array.isArray(submission.perguntas) || submission.perguntas.length < 1 || submission.perguntas.length > 200
      || submission.quantidade !== submission.perguntas.length) return false;
    const perguntas = submission.perguntas;
    if (!perguntas.every((item, index) => item && Object.keys(item).every(key => ['pergunta', 'resposta', 'ordem'].includes(key))
      && typeof item.pergunta === 'string' && item.pergunta.trim().length > 0 && item.pergunta.length <= 1000
      && typeof item.resposta === 'string' && item.resposta.trim().length > 0 && item.resposta.length <= 4000
      && item.ordem === index)) return false;
    return new TextEncoder().encode(JSON.stringify(perguntas)).length <= 750 * 1024;
  }

  const marketplace = {
    async listCatalog({ search = '', cursor = null, limit = 12 } = {}) {
      const key = publicPrefix(search);
      let query = publicLists.where('status', '==', 'active');
      if (key) query = query.orderBy('titleKey').startAt(key).endAt(key + '\uf8ff');
      else query = query.orderBy('publishedAt', 'desc');
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.limit(limit).get();
      return { items: snapshot.docs.map(asItem), cursor: snapshot.docs.at(-1) || null, hasMore: snapshot.size === limit };
    },
    async getPublication(id) {
      const ref = publicLists.doc(id);
      const metadata = await ref.get();
      if (!metadata.exists || metadata.data().status !== 'active') return null;
      const content = await ref.collection('content').doc('main').get();
      if (!content.exists) return null;
      const listing = asItem(metadata);
      const body = content.data();
      if (listing.versao !== body.versao || !Array.isArray(body.perguntas)) throw new Error('A lista está sendo atualizada. Tente novamente.');
      return { ...listing, perguntas: body.perguntas };
    },
    async getOwnPublications(uid) {
      const snapshot = await publicLists.where('ownerUid', '==', uid).orderBy('updatedAt', 'desc').limit(50).get();
      return snapshot.docs.map(asItem);
    },
    async getOwnSubmissions(uid) {
      const snapshots = await Promise.all([1, 2, 3].map(slot => submissions.doc(slotId(uid, slot)).get()));
      return snapshots.filter(document => document.exists).map(asItem);
    },
    async isModerator(uid) {
      const document = await moderators.doc(uid).get();
      return document.exists && document.data().ativo === true && auth.currentUser?.emailVerified === true;
    },
    async getModerationQueue() {
      const [pending, openReports] = await Promise.all([
        submissions.where('status', '==', 'pending').orderBy('submittedAt').limit(25).get(),
        reports.where('status', '==', 'open').orderBy('createdAt', 'desc').limit(25).get()
      ]);
      return { submissions: pending.docs.map(asItem), reports: openReports.docs.map(asItem) };
    },
    async submitList(uid, payload) {
      if (!auth.currentUser?.emailVerified) throw new Error('Confirme seu e-mail antes de enviar uma lista.');
      const refs = [1, 2, 3].map(slot => submissions.doc(slotId(uid, slot)));
      const snapshots = await Promise.all(refs.map(ref => ref.get()));
      const now = Date.now();
      const available = snapshots.findIndex(snapshot => !snapshot.exists || (snapshot.data().status !== 'pending' && snapshot.data().submittedAt?.toDate?.() && now - snapshot.data().submittedAt.toDate().getTime() >= 86400000));
      if (available < 0) throw new Error('Você tem três envios em análise ou precisa aguardar 24 horas após a última decisão.');
      const slot = available + 1;
      const document = {
        ownerUid: uid, slot, sourceListId: payload.sourceListId,
        targetPublicationId: payload.targetPublicationId || null,
        titulo: payload.titulo, descricao: payload.descricao, autorApelido: payload.autorApelido,
        perguntas: payload.perguntas.map((item, ordem) => ({ pergunta: item.pergunta, resposta: item.resposta, ordem })),
        quantidade: payload.perguntas.length, status: 'pending', submittedAt: serverTime()
      };
      await refs[available].set(document);
      return { id: refs[available].id, slot };
    },
    async cancelSubmission(id) {
      await submissions.doc(id).update({ status: 'cancelled', cancelledAt: serverTime() });
    },
    async withdrawPublication(id, uid) {
      const ref = publicLists.doc(id);
      const snapshot = await ref.get();
      if (!snapshot.exists || snapshot.data().ownerUid !== uid || snapshot.data().status !== 'active') throw new Error('Esta publicação não pode ser retirada.');
      await ref.update({ status: 'withdrawn', withdrawnAt: serverTime() });
    },
    async reportPublication(id, uid, reason, note) {
      if (!auth.currentUser?.emailVerified) throw new Error('Confirme seu e-mail antes de enviar uma denúncia.');
      const ref = reports.doc(`${id}_${uid}`);
      await ref.create({ publicationId: id, reporterUid: uid, reason, note: (note || '').slice(0, 300), status: 'open', createdAt: serverTime() });
    },
    async decideSubmission(id, decision, reason = '') {
      const ref = submissions.doc(id);
      const uid = auth.currentUser?.uid;
      await db.runTransaction(async transaction => {
        const snapshot = await transaction.get(ref);
        if (!snapshot.exists || snapshot.data().status !== 'pending') throw new Error('Este envio já foi analisado.');
        const submission = snapshot.data();
        if (!uid || uid === submission.ownerUid || !auth.currentUser?.emailVerified) throw new Error('Sua conta não pode aprovar este envio.');
        if (decision === 'reject') {
          transaction.update(ref, { status: 'rejected', rejectionReason: reason.slice(0, 300), decisionAt: serverTime(), decisionBy: uid });
          return;
        }
        if (decision !== 'approve' || !validateSubmissionContent(submission)) throw new Error('O envio não passou na validação de título, descrição, apelido ou conteúdo. Peça ao autor que corrija e envie novamente.');
        const publicationId = submission.targetPublicationId || crypto.randomUUID();
        const listingRef = publicLists.doc(publicationId);
        let previous = null;
        if (submission.targetPublicationId) {
          const current = await transaction.get(listingRef);
          if (!current.exists || current.data().ownerUid !== submission.ownerUid || !['active', 'withdrawn'].includes(current.data().status)) throw new Error('A publicação original não está disponível para nova versão ou não pertence a este autor.');
          previous = current.data();
        }
        const version = (previous?.versao || 0) + 1;
        const metadata = {
          ownerUid: submission.ownerUid, sourceListId: submission.sourceListId,
          titulo: submission.titulo, titleKey: publicPrefix(submission.titulo),
          descricao: submission.descricao, autorApelido: submission.autorApelido,
          quantidade: submission.perguntas.length, status: 'active', acesso: 'free',
          versao: version, publishedAt: previous?.publishedAt || serverTime(), updatedAt: serverTime()
        };
        transaction.set(listingRef, metadata);
        transaction.set(listingRef.collection('content').doc('main'), { versao: version, perguntas: submission.perguntas });
        transaction.update(ref, { status: 'approved', publicationId, decisionAt: serverTime(), decisionBy: uid, rejectionReason: '' });
      });
    },
    async resolveReport(id, status, reason = '') {
      if (!['resolved', 'dismissed'].includes(status)) throw new Error('Decisão de denúncia inválida.');
      await reports.doc(id).update({ status, resolution: reason.slice(0, 300), resolvedAt: serverTime(), resolvedBy: auth.currentUser.uid });
    },
    async hidePublication(id, reason = '') {
      const ref = publicLists.doc(id);
      await ref.update({ status: 'hidden', moderationNote: reason.slice(0, 300), updatedAt: serverTime() });
    },
    async blockUser(uid, reason = '') {
      await blocks.doc(uid).set({ ativo: true, motivo: reason.slice(0, 300), updatedAt: serverTime() });
    }
  };

  function mapSnapshot(snapshot) {
    return snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
  }

  function saveAll(lists, questions) {
    if (!currentUid) return Promise.resolve(false);
    const uid = currentUid;
    dirty = true;
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      const [remoteLists, remoteQuestions] = await Promise.all([
        collection(uid, 'listas').get(),
        collection(uid, 'perguntas').get()
      ]);
      const desiredLists = new Map(lists.map(item => [item.id, item]));
      const desiredQuestions = new Map(questions.map(item => [item.id, item]));
      const operations = [];
      for (const item of lists) operations.push({ ref: collection(uid, 'listas').doc(item.id), data: item });
      for (const item of questions) operations.push({ ref: collection(uid, 'perguntas').doc(item.id), data: item });
      for (const document of remoteLists.docs) if (!desiredLists.has(document.id)) operations.push({ ref: document.ref, delete: true });
      for (const document of remoteQuestions.docs) if (!desiredQuestions.has(document.id)) operations.push({ ref: document.ref, delete: true });
      for (let start = 0; start < operations.length; start += 450) {
        const batch = db.batch();
        for (const operation of operations.slice(start, start + 450)) {
          if (operation.delete) batch.delete(operation.ref);
          else batch.set(operation.ref, operation.data);
        }
        await batch.commit();
      }
      knownLists = desiredLists;
      knownQuestions = desiredQuestions;
      dirty = false;
      return true;
    }).catch(error => { dirty = true; throw error; });
    return writeQueue;
  }

  function saveDelta(lists, questions) {
    if (!currentUid) return Promise.resolve(false);
    const uid = currentUid;
    const desiredLists = new Map(lists.map(item => [item.id, item]));
    const desiredQuestions = new Map(questions.map(item => [item.id, item]));
    const operations = [];
    for (const [id, item] of desiredLists) if (JSON.stringify(knownLists.get(id)) !== JSON.stringify(item)) operations.push({ ref: collection(uid, 'listas').doc(id), data: item });
    for (const [id, item] of desiredQuestions) if (JSON.stringify(knownQuestions.get(id)) !== JSON.stringify(item)) operations.push({ ref: collection(uid, 'perguntas').doc(id), data: item });
    for (const id of knownLists.keys()) if (!desiredLists.has(id)) operations.push({ ref: collection(uid, 'listas').doc(id), delete: true });
    for (const id of knownQuestions.keys()) if (!desiredQuestions.has(id)) operations.push({ ref: collection(uid, 'perguntas').doc(id), delete: true });
    if (!operations.length) return Promise.resolve(true);
    dirty = true;
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      for (let start = 0; start < operations.length; start += 450) {
        const batch = db.batch();
        for (const operation of operations.slice(start, start + 450)) {
          if (operation.delete) batch.delete(operation.ref);
          else batch.set(operation.ref, operation.data);
        }
        await batch.commit();
      }
      knownLists = desiredLists;
      knownQuestions = desiredQuestions;
      dirty = false;
      return true;
    }).catch(error => { dirty = true; throw error; });
    return writeQueue;
  }

  function stopSync() {
    listSubscription?.();
    questionSubscription?.();
    listSubscription = questionSubscription = null;
    currentUid = null;
    onRemoteChange = null;
    knownLists = new Map();
    knownQuestions = new Map();
  }

  function watch(uid, callback) {
    stopSync();
    currentUid = uid;
    onRemoteChange = callback;
    let lists = null;
    let questions = null;
    let firstSnapshot = true;
    let initialFailed = false;
    const handleError = error => {
      console.error('Firestore:', error);
      if (firstSnapshot) {
        firstSnapshot = false;
        initialFailed = true;
        callback({ lists: [], questions: [] }, true, error);
      }
    };
    const publish = () => {
      if (!lists || !questions || initialFailed) return;
      const data = {
        lists: mapSnapshot(lists),
        questions: mapSnapshot(questions).sort((a, b) => {
          const first = Number.isSafeInteger(a.ordem) && a.ordem >= 0 ? a.ordem : Number.MAX_SAFE_INTEGER;
          const second = Number.isSafeInteger(b.ordem) && b.ordem >= 0 ? b.ordem : Number.MAX_SAFE_INTEGER;
          return first - second;
        })
      };
      knownLists = new Map(data.lists.map(item => [item.id, item]));
      knownQuestions = new Map(data.questions.map(item => [item.id, item]));
      if (firstSnapshot) {
        firstSnapshot = false;
        callback(data, true);
      } else if (!dirty) callback(data, false);
    };
    listSubscription = collection(uid, 'listas').onSnapshot(snapshot => { lists = snapshot; publish(); }, handleError);
    questionSubscription = collection(uid, 'perguntas').onSnapshot(snapshot => { questions = snapshot; publish(); }, handleError);
  }

  window.FirebaseCloud = {
    auth,
    createAccount: (email, password) => auth.createUserWithEmailAndPassword(email, password),
    signIn: (email, password) => auth.signInWithEmailAndPassword(email, password),
    resetPassword: email => auth.sendPasswordResetEmail(email),
    sendVerificationEmail: () => auth.currentUser.sendEmailVerification(),
    signOut: () => auth.signOut(),
    watch,
    saveAll,
    saveDelta,
    isDirty: () => dirty,
    stopSync,
    marketplace
  };
})();
