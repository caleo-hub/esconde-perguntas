import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { assertFails, assertSucceeds, initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';

const projectId = 'demo-esconde-perguntas';
let env;

function publicMetadata(id, ownerUid = 'owner') {
  return {
    ownerUid, sourceListId: 'list-1', titulo: 'Lista ' + id, titleKey: 'lista ' + id,
    descricao: '', autorApelido: 'Autor', quantidade: 1, status: 'active',
    acesso: 'free', versao: 1, publishedAt: new Date(), updatedAt: new Date()
  };
}

function submission(ownerUid, slot = 1) {
  return {
    ownerUid, slot, sourceListId: 'list-1', targetPublicationId: null,
    titulo: 'Lista de teste', descricao: '', autorApelido: 'Estudante',
    perguntas: [{ pergunta: 'Pergunta?', resposta: 'Resposta', ordem: 0 }],
    quantidade: 1, status: 'pending', submittedAt: serverTimestamp()
  };
}

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: '127.0.0.1',
      port: 8080,
      rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
    }
  });
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    await setDoc(doc(db, 'marketplaceModerators', 'moderator'), { ativo: true });
    await setDoc(doc(db, 'marketplaceLists', 'active-list'), publicMetadata('active-list'));
    await setDoc(doc(db, 'marketplaceLists', 'active-list', 'content', 'main'), {
      versao: 1, perguntas: [{ pergunta: 'Pergunta pública?', resposta: 'Resposta pública', ordem: 0 }]
    });
    await setDoc(doc(db, 'marketplaceLists', 'hidden-list'), { ...publicMetadata('hidden-list'), status: 'hidden' });
    await setDoc(doc(db, 'marketplaceLists', 'hidden-list', 'content', 'main'), {
      versao: 1, perguntas: [{ pergunta: 'Privada?', resposta: 'Não', ordem: 0 }]
    });
  });
});

after(async () => { await env?.cleanup(); });

test('mantém listas pessoais isoladas entre contas', async () => {
  const ownerDb = env.authenticatedContext('owner', { email_verified: true }).firestore();
  const otherDb = env.authenticatedContext('other', { email_verified: true }).firestore();
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'users/owner/listas/my-list'), { nome: 'Privada' });
  });
  await assertSucceeds(getDoc(doc(ownerDb, 'users/owner/listas/my-list')));
  await assertFails(getDoc(doc(otherDb, 'users/owner/listas/my-list')));
});

test('visitante consulta somente publicações ativas', async () => {
  const db = env.unauthenticatedContext().firestore();
  await assertSucceeds(getDoc(doc(db, 'marketplaceLists/active-list')));
  await assertSucceeds(getDoc(doc(db, 'marketplaceLists/active-list/content/main')));
  await assertFails(getDoc(doc(db, 'marketplaceLists/hidden-list')));
  await assertFails(getDoc(doc(db, 'marketplaceLists/hidden-list/content/main')));
  const activeQuery = query(collection(db, 'marketplaceLists'), where('status', '==', 'active'), orderBy('publishedAt', 'desc'), limit(12));
  await assertSucceeds(getDocs(activeQuery));
  await assertFails(setDoc(doc(db, 'marketplaceLists/visitor-list'), publicMetadata('visitor-list')));
});

test('exige e-mail verificado para enviar e denunciar', async () => {
  const db = env.authenticatedContext('unverified', { email_verified: false }).firestore();
  await assertFails(setDoc(doc(db, 'marketplaceSubmissions/unverified_1'), submission('unverified')));
  await assertFails(setDoc(doc(db, 'marketplaceReports/active-list_unverified'), {
    publicationId: 'active-list', reporterUid: 'unverified', reason: 'other',
    note: '', status: 'open', createdAt: serverTimestamp()
  }));
});

test('aceita envio verificado no slot próprio e impede forjar autor ou usar slot 4', async () => {
  const db = env.authenticatedContext('owner', { email_verified: true }).firestore();
  await assertSucceeds(setDoc(doc(db, 'marketplaceSubmissions/owner_1'), submission('owner', 1)));
  await assertFails(setDoc(doc(db, 'marketplaceSubmissions/owner_2'), submission('someone-else', 2)));
  await assertFails(setDoc(doc(db, 'marketplaceSubmissions/owner_4'), submission('owner', 4)));
  await assertFails(updateDoc(doc(db, 'marketplaceSubmissions/owner_1'), { status: 'approved' }));
});

test('limita a fila de envios pendentes a moderadores', async () => {
  const moderatorDb = env.authenticatedContext('moderator', { email_verified: true }).firestore();
  const moderatorQueue = query(collection(moderatorDb, 'marketplaceSubmissions'), where('status', '==', 'pending'), orderBy('submittedAt'), limit(25));
  await assertSucceeds(getDocs(moderatorQueue));
  const otherDb = env.authenticatedContext('other', { email_verified: true }).firestore();
  const otherQueue = query(collection(otherDb, 'marketplaceSubmissions'), where('status', '==', 'pending'), orderBy('submittedAt'), limit(25));
  await assertFails(getDocs(otherQueue));
});

test('moderador publica para outra pessoa e não pode publicar em nome próprio', async () => {
  const moderatorDb = env.authenticatedContext('moderator', { email_verified: true }).firestore();
  const publication = publicMetadata('new-publication', 'author');
  await assertSucceeds(setDoc(doc(moderatorDb, 'marketplaceLists/new-publication'), publication));
  await assertFails(setDoc(doc(moderatorDb, 'marketplaceLists/self-publication'), publicMetadata('self-publication', 'moderator')));
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), 'marketplaceSubmissions/author_1'), submission('author'));
  });
  await assertSucceeds(updateDoc(doc(moderatorDb, 'marketplaceSubmissions/author_1'), {
    status: 'approved', publicationId: 'new-publication', decisionAt: serverTimestamp(), decisionBy: 'moderator'
  }));
});
