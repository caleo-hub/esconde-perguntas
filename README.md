# Esconde Perguntas

Aplicativo de revisão feito apenas com HTML, CSS e JavaScript. Funciona como site no GitHub Pages e pode ser instalado como PWA em navegadores compatíveis.

## Recursos

- Criar, editar, excluir e buscar perguntas.
- Colar uma lista numerada de perguntas e respostas para cadastrar em lote.
- Revelar a resposta em cada cartão.
- Marcar perguntas com uma estrela e usar o filtro “Difíceis” para revisar somente elas. As marcações também são incluídas nos backups.
- Revisar uma pergunta por vez, em ordem normal ou aleatória.
- Salvar automaticamente no `localStorage` deste navegador.
- Exportar e importar perguntas em arquivo JSON.
- Abrir sem internet após o primeiro carregamento, por meio de Service Worker.

## Uso local

Abra `index.html` no navegador para usar as funções principais. Para testar instalação e funcionamento offline, sirva a pasta por HTTP local, por exemplo com `python -m http.server 8000`, e abra `http://localhost:8000/`.

O arquivo exportado segue o formato `{ "version": 1, "perguntas": [...] }`. A importação acrescenta as perguntas ao conjunto atual. Faça backups regularmente: limpar os dados do navegador também apaga as perguntas locais.

No cadastro em lote, cole uma lista como `1. Pergunta?` seguida da resposta na próxima linha. Separe os pares com uma linha vazia. O formulário também aceita `Pergunta | Resposta` e duas colunas copiadas de uma planilha. O botão “Copiar prompt para o ChatGPT” oferece um texto para formatar anotações antes de colá-las no aplicativo; nenhuma chamada à API é necessária.

## Publicação

O projeto usa caminhos relativos e pode ser publicado a partir da raiz da branch `main` no GitHub Pages. Não há build nem dependências de produção.
