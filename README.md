# Esconde Perguntas

Aplicativo de revisão feito apenas com HTML, CSS e JavaScript. Funciona como site no GitHub Pages e pode ser instalado como PWA em navegadores compatíveis.

## Recursos

- Criar, editar, excluir e buscar perguntas.
- Colar uma lista numerada de perguntas e respostas para cadastrar em lote.
- Ignorar perguntas e respostas idênticas dentro da mesma lista no cadastro individual, em lote e na importação. Pares iguais em listas diferentes continuam permitidos.
- Revelar cada resposta ou mostrar e ocultar todas as respostas dos cartões exibidos após busca e filtro.
- Marcar perguntas como ★ Difíceis e promover as mais trabalhosas a ! Muito difíceis. O filtro ★ inclui os dois níveis; o filtro ! mostra somente o nível mais alto. As marcações entram nos backups.
- Criar listas por assunto, mover perguntas entre listas e revisar cada assunto separadamente.
- Revisar as perguntas em uma lista com rolagem e revelar cada resposta no próprio cartão, em ordem normal ou aleatória.
- Embaralhar as perguntas e voltar à ordem normal com o mesmo botão. Os cartões ficam sempre em uma coluna, inclusive em tablets e computadores.
- Entrar ou criar uma conta com e-mail e senha; listas e perguntas são sincronizadas no Firestore e isoladas por conta.
- Guardar uma cópia local para continuar usando as perguntas neste navegador.
- Exportar e importar perguntas em arquivo JSON.
- Abrir sem internet após o primeiro carregamento, por meio de Service Worker.

## Uso local

Abra `index.html` no navegador para usar as funções principais. Para testar instalação e funcionamento offline, sirva a pasta por HTTP local, por exemplo com `python -m http.server 8000`, e abra `http://localhost:8000/`.

O arquivo exportado inclui listas e perguntas no formato `{ "version": 2, "listas": [...], "perguntas": [...] }`. A ordem do array é preservada no navegador e na conta por meio do campo `ordem`. Ao importar, as perguntas do arquivo aparecem na sequência do backup; perguntas com o mesmo ID são atualizadas sem duplicação, e as demais perguntas existentes ficam depois. Backups da versão 1 também são aceitos e suas perguntas entram em Geral. Faça backups regularmente.

Perguntas antigas são migradas automaticamente para Geral. A lista Geral pode ser renomeada, mas não excluída. Ao excluir outra lista, suas perguntas são movidas para a lista Geral, com respostas e estrelas preservadas.

O campo opcional `muitoDificil` é salvo junto da pergunta e sempre implica `dificil: true`. Backups anteriores continuam aceitos. O estado de respostas abertas é temporário e volta a ficar oculto ao reabrir o aplicativo. Ao criar a primeira conta em um aparelho com perguntas antigas, a pessoa pode escolher copiá-las para a conta; a opção aparece marcada por padrão e informa quantas perguntas serão copiadas. Se desmarcada, as perguntas permanecem salvas no aparelho.

No cadastro em lote, cole uma lista como `1. Pergunta?` seguida da resposta na próxima linha. Separe os pares com uma linha vazia. O formulário também aceita `Pergunta | Resposta` e duas colunas copiadas de uma planilha. O botão “Copiar prompt para o ChatGPT” oferece um texto para formatar anotações antes de colá-las no aplicativo; nenhuma chamada à API é necessária.

Se houver pares repetidos já salvos, a tela inicial mostra a quantidade e o botão **Baixar backup e limpar repetidas**. A limpeza atua em cada lista separadamente, mantém a primeira posição e o ID da pergunta, e preserva o nível mais alto de dificuldade encontrado entre as cópias. O backup completo é baixado antes da alteração, que depois é sincronizada na conta.

## Publicação

O projeto usa caminhos relativos e pode ser publicado a partir da raiz da branch `main` no GitHub Pages. Não há build nem dependências de produção.

## Firebase

O app usa Firebase Authentication com e-mail e senha e grava cada conta em `users/{uid}/listas` e `users/{uid}/perguntas`. A configuração Web em `js/firebase-config.js` é pública; as regras publicadas em `firestore.rules` limitam cada usuário aos próprios documentos. Os arquivos compat do SDK ficam em `vendor/firebase/` para manter o shell do app disponível offline. O provedor E-mail/senha e o domínio `caleo-hub.github.io` estão habilitados no Firebase Authentication. O banco atual está na região `nam5`.

O antigo catálogo de compartilhamento foi desativado. As coleções históricas do catálogo não são acessíveis pelas regras atuais; as listas pessoais permanecem nas contas.
