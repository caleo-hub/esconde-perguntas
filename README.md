# Esconde Perguntas

Aplicativo de revisão feito apenas com HTML, CSS e JavaScript. Funciona como site no GitHub Pages e pode ser instalado como PWA em navegadores compatíveis.

## Recursos

- Criar, editar, excluir e buscar perguntas.
- Colar uma lista numerada de perguntas e respostas para cadastrar em lote.
- Revelar cada resposta ou mostrar e ocultar todas as respostas dos cartões exibidos após busca e filtro.
- Marcar perguntas como ★ Difíceis e promover as mais trabalhosas a ! Muito difíceis. O filtro ★ inclui os dois níveis; o filtro ! mostra somente o nível mais alto. As marcações entram nos backups.
- Criar listas por assunto, mover perguntas entre listas e revisar cada assunto separadamente.
- Revisar as perguntas em uma lista com rolagem e revelar cada resposta no próprio cartão, em ordem normal ou aleatória.
- Embaralhar as perguntas e voltar à ordem normal com o mesmo botão. Os cartões ficam sempre em uma coluna, inclusive em tablets e computadores.
- Entrar ou criar uma conta com e-mail e senha; listas e perguntas são sincronizadas no Firestore e isoladas por conta.
- Explorar listas públicas aprovadas pela comunidade, copiar uma lista para a própria conta ou enviar uma lista à equipe para aprovação.
- Denunciar conteúdo e revisar envios em uma área de moderação separada, acessível somente a contas verificadas cadastradas pelo responsável do Firebase.
- Guardar uma cópia local para continuar usando as perguntas neste navegador.
- Exportar e importar perguntas em arquivo JSON.
- Abrir sem internet após o primeiro carregamento, por meio de Service Worker.

## Uso local

Abra `index.html` no navegador para usar as funções principais. Para testar instalação e funcionamento offline, sirva a pasta por HTTP local, por exemplo com `python -m http.server 8000`, e abra `http://localhost:8000/`.

O arquivo exportado inclui listas e perguntas no formato `{ "version": 2, "listas": [...], "perguntas": [...] }`. A ordem do array é preservada no navegador e na conta por meio do campo `ordem`. Ao importar, as perguntas do arquivo aparecem na sequência do backup; perguntas com o mesmo ID são atualizadas sem duplicação, e as demais perguntas existentes ficam depois. Backups da versão 1 também são aceitos e suas perguntas entram em Geral. Faça backups regularmente.

Perguntas antigas são migradas automaticamente para Geral. A lista Geral pode ser renomeada, mas não excluída. Ao excluir outra lista, suas perguntas são movidas para a lista Geral, com respostas e estrelas preservadas.

O campo opcional `muitoDificil` é salvo junto da pergunta e sempre implica `dificil: true`. Backups anteriores continuam aceitos. O estado de respostas abertas é temporário e volta a ficar oculto ao reabrir o aplicativo. Ao criar a primeira conta em um aparelho com perguntas antigas, a pessoa pode escolher copiá-las para a conta; a opção aparece marcada por padrão e informa quantas perguntas serão copiadas. Se desmarcada, as perguntas permanecem salvas no aparelho.

No cadastro em lote, cole uma lista como `1. Pergunta?` seguida da resposta na próxima linha. Separe os pares com uma linha vazia. O formulário também aceita `Pergunta | Resposta` e duas colunas copiadas de uma planilha. O botão “Copiar prompt para o ChatGPT” oferece um texto para formatar anotações antes de colá-las no aplicativo; nenhuma chamada à API é necessária.

## Publicação

O projeto usa caminhos relativos e pode ser publicado a partir da raiz da branch `main` no GitHub Pages. Não há build nem dependências de produção.

## Firebase

O app usa Firebase Authentication com e-mail e senha e grava cada conta em `users/{uid}/listas` e `users/{uid}/perguntas`. A configuração Web em `js/firebase-config.js` é pública; as regras publicadas em `firestore.rules` limitam cada usuário aos próprios documentos. Os arquivos compat do SDK ficam em `vendor/firebase/` para manter o shell do app disponível offline. O provedor E-mail/senha e o domínio `caleo-hub.github.io` estão habilitados no Firebase Authentication. O banco atual está na região `nam5`.

## Catálogo de listas

O catálogo é público para leitura, mas só inclui documentos aprovados em `marketplaceLists`. Os documentos pessoais em `users/{uid}` continuam privados. Uma publicação guarda os metadados no documento principal e as perguntas em `content/main`; as estrelas pessoais não são publicadas. Publicações e envios são snapshots: alterações do autor só chegam ao catálogo depois de nova aprovação, e cópias existentes não são alteradas.

Cada conta verificada pode manter até três envios pendentes. Um slot decidido ou cancelado pode ser reutilizado após 24 horas. Cada envio aceita de 1 a 200 perguntas, pergunta de até 1.000 caracteres, resposta de até 4.000 caracteres e conteúdo serializado de até 750 KiB. O app não consulta o conteúdo das perguntas no Firestore. As isenções para os campos grandes estão declaradas em `firestore.indexes.json`, mas a gravação delas pelo Console falhou e ainda precisa ser aplicada via Firebase CLI. O catálogo pagina em lotes de 12 e permite buscar pelo início do título.

### Preparar a equipe de moderação

1. Na página Authentication do Firebase, obtenha o UID de cada pessoa que deve moderar e confirme que a conta foi verificada por e-mail.
2. No Firestore Console, crie `marketplaceModerators/{UID}` com `ativo: true`. Somente o responsável pelo projeto deve criar ou revogar esses documentos; nenhuma tela do app concede esse papel.
3. A pessoa moderadora entra no app com a conta verificada e abre **Moderação** no menu. A fila mostra envios e denúncias; a aprovação publica o snapshot, a rejeição registra um motivo e denúncias podem ser resolvidas ou causar ocultação.
4. Para revogar acesso, apague o documento ou defina `ativo: false`. As regras negam novas ações administrativas.

### App Check e publicação

O SDK do App Check está incluído, mas App Check permanece **desativado e sem chave** nesta versão, por decisão do responsável pelo projeto. Para ativá-lo futuramente, crie uma chave Web no Google Cloud limitada a `caleo-hub.github.io`, registre o app em Firebase Console > Segurança > App Check e preencha `appCheckSiteKey` em `js/firebase-config.js`. A API reCAPTCHA Enterprise pode exigir aceitação de termos e ter custos por volume; revise essas condições no Console antes de habilitá-la. Primeiro confira as métricas em modo de observação e só então ative a exigência para o Firestore. Não inclua credenciais de service account no repositório.

Publique índices e regras antes do site com `npx firebase-tools deploy --only firestore:rules,firestore:indexes --project esconde-perguntas`. Depois publique a branch `main` no GitHub Pages e confirme que o Service Worker atualizou. O catálogo, denúncias, cópia e moderação exigem conexão; as listas pessoais continuam disponíveis offline.

O projeto permanece no plano gratuito Spark. Acompanhe o uso na aba Usage do Firestore: cotas diárias de leitura e gravação podem tornar o catálogo temporariamente indisponível se forem atingidas. O App Check reduz abuso de clientes não genuínos, mas não substitui as regras nem impede todo abuso com múltiplas contas.

### Futuras vendas

As listas publicadas nesta versão permanecem gratuitas e copiáveis. Não converta uma publicação gratuita em paga. Uma futura versão comercial exigirá backend para verificar pagamentos e autorizações antes de entregar conteúdo protegido; nenhum checkout, preço, pagamento ou repasse faz parte desta fase.
