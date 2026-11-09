# Skincare

App pessoal para acompanhar a rotina de skincare no iPhone. É um PWA: instala na tela inicial, funciona offline e guarda tudo no próprio aparelho, sem servidor e sem conta.

HTML, CSS e JavaScript puros, sem framework, sem build e sem dependências.

## Rodar no computador

Na pasta do projeto, rode um servidor estático. Escolha uma das opções:

```bash
python3 -m http.server 8000
```

```bash
npx serve -l 8000
```

Depois abra <http://localhost:8000>. Para ver como no celular, use o modo de dispositivo do navegador (no Chrome: F12 e o ícone de celular).

> Abrir o `index.html` direto (file://) não funciona: os módulos JavaScript e o modo offline precisam de um servidor.

### Testes

Os testes cobrem as regras da rotina: dias da semana, adaptação, pausa, lembrete e progresso. Precisam do Node 18 ou mais novo e não instalam nada:

```bash
npm test
```

### Espiar no iPhone pela rede de casa

Com o servidor rodando, abra `http://IP-DO-COMPUTADOR:8000` no Safari do iPhone. Serve para ver a interface, mas **não** instala com modo offline: o iOS exige HTTPS para isso. Para instalar de verdade, publique (abaixo).

## Publicar (HTTPS grátis)

O servidor só entrega os arquivos. Seus dados nunca saem do iPhone.

**GitHub Pages:** envie esta pasta para um repositório público. Em *Settings → Pages*, escolha *Deploy from a branch*, branch `main`, pasta `/ (root)`. O endereço fica `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

**Netlify:** entre em <https://app.netlify.com/drop> e arraste a pasta do projeto (descompactada). O Netlify pede uma conta gratuita para manter o site no ar.

### Ao publicar uma versão nova

Aumente o número em `sw.js` (`const VERSION = 'v2'`, `'v3'`…). Na próxima vez que você abrir o app com internet, ele baixa a versão nova e recarrega sozinho.

## Instalar no iPhone

1. Abra o endereço publicado no **Safari**. Tem que ser o Safari, não outro navegador.
2. Toque em **Compartilhar** (quadrado com seta para cima).
3. Toque em **Adicionar à Tela de Início** e confirme.
4. Abra sempre pelo ícone. O app abre em tela cheia e funciona offline depois do primeiro acesso.

Importante:

- O app instalado guarda os dados separado do Safari. O que você marcar no Safari não aparece no app instalado, e vice-versa.
- **Apagar o ícone apaga os dados.** Faça backup antes (exportar JSON chega na etapa 2).

## Como funciona

- **Hoje:** checklist da manhã e da noite montado pelo dia da semana, pela fase (adaptação nos 7 primeiros dias, depois rotina completa) e por pausas ativas. O dia vira às 4h da manhã, então a rotina da noite feita depois da meia-noite conta para o dia certo.
- **Vou sair:** contagem de 2 h para reaplicar o protetor (rosto e corpo). Sem servidor, o iOS não deixa um app web notificar com o app fechado. Por isso existe o botão **Adicionar ao Calendário**, que cria um evento com alarme no horário da reaplicação.
- **Tive irritação:** você escolhe a área (rosto, corpo ou os dois), os sintomas e 2 ou 3 dias de pausa.
  - Rosto: saem vitamina C, ácido lático + kójico e alfa-arbutin.
  - Corpo: sai a emulsão de ácido lático.
  - Dá para encerrar a pausa antes.
  - Se a irritação voltar até 7 dias depois de uma pausa, o app sugere procurar um dermatologista.

## Estrutura

```
index.html             página única + barra de abas
manifest.webmanifest   nome, ícones e modo tela cheia do PWA
sw.js                  service worker (cache para funcionar offline)
css/style.css          visual, com tema claro e escuro automáticos
icons/                 ícones da tela inicial
js/
  app.js               inicialização, abas, cliques e salvamento
  seed.js              rotina inicial (produtos e passos)
  routine.js           regras: o que entra no checklist de cada dia
  actions.js           ações que alteram os dados (marcar, pausar, sair…)
  store.js             salvar e carregar no aparelho (localStorage)
  dates.js             datas e formatos em português
  ics.js               evento de calendário do lembrete
  ui.js                ícones, anel de progresso, escape de texto
  views/               telas: today.js, history.js, settings.js
tests/routine.test.js  testes das regras (node --test)
```

### Dados salvos

Tudo fica num único JSON no `localStorage` (chave `skincare.state`):

```js
{
  settings: { startDate, adaptationDays, dayStartsAt, sunscreenIntervalMin, pauseDefaultDays, supplement },
  products: [{ id, name, pausable, sunscreen, openedAt, durationDays }],
  steps:    [{ id, period, area, order, productId, weekdays, adaptation, note }],
  log:      { 'AAAA-MM-DD': { expected, done, supplement, irritations, outings, reapplied } },
  pauses:   [{ id, area, from, to, symptoms }],
  sunscreen: { dueAt, setAt } | null
}
```

Cada dia guarda a própria lista de passos esperados (`expected`). Assim, mudar a rotina depois não altera o histórico.

## Etapas

1. ✅ Base do PWA, dados, regras e tela Hoje (com pausa e lembrete do protetor)
2. Histórico (calendário e sequência) e Ajustes (produtos, rotina, data de início, backup)
3. Fotos de progresso
4. Produtos e alerta de recompra
