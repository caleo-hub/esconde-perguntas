(() => {
  'use strict';

  const app = firebase.initializeApp(window.FIREBASE_CONFIG);
  const auth = app.auth();
  const db = app.firestore();
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
      const data = { lists: mapSnapshot(lists), questions: mapSnapshot(questions) };
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
    signOut: () => auth.signOut(),
    watch,
    saveAll,
    saveDelta,
    isDirty: () => dirty,
    stopSync
  };
})();
