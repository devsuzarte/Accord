# 09 — Estudo: como o OpenCluely faz o overlay e o que levamos para o sharescreen

**Fonte estudada:** [TechyCSR/OpenCluely](https://github.com/TechyCSR/OpenCluely), commit `0a9da75` (29/07/2026), licença Apache-2.0, Electron 29.
**Escopo:** só a mecânica do overlay (janelas, transparência, clique, posição, atalhos, captura). Nenhuma funcionalidade do OpenCluely (LLM, OCR, transcrição) entra no projeto, e nenhum código é copiado: o estudo serve de referência para reimplementar do nosso jeito, em TypeScript.

Arquivos lidos: `src/managers/window.manager.js` (1824 linhas, o coração do overlay), `main.js` (atalhos globais e IPC), `index.html` + `src/ui/main-window.js` (a barra), `preload.js`, `src/core/config.js`.

Legenda: **[Verificado]** = confirmado na documentação do Electron · **[Observado]** = está no código do OpenCluely · **[Decisão]** = escolha nossa.

---

## 1. Como o OpenCluely monta o overlay

### 1.1 A barra é uma janela do tamanho exato do conteúdo
**[Observado]** A janela principal é uma barra de 28 px de altura, sem moldura e transparente. O renderer mede o elemento da barra (`getBoundingClientRect`) e pede ao main, por IPC (`resize-window`), que ajuste o tamanho com `setContentSize(largura, altura)`. Quando abre um popover, a altura cresce para caber nele.

Com isso, **quase não sobra área transparente**: a janela é a própria barra. Dispensa click-through na maior parte do tempo, porque não há "vazio" para o clique precisar atravessar.

### 1.2 Opções da janela
**[Observado]** Combinação usada na barra:

| Opção | Valor | Para quê |
|---|---|---|
| `frame` | `false` | sem barra de título |
| `transparent` + `backgroundColor` | `true` + `'#00000000'` | fundo 100% transparente |
| `hasShadow` | `false` | sem sombra do sistema em volta da área transparente |
| `thickFrame` | `false` (Windows) | **[Verificado]** remove sombra e animações da janela sem moldura no Windows |
| `skipTaskbar` | `true` | não aparece na barra de tarefas |
| `minimizable`, `maximizable`, `fullscreenable` | `false` | não vira "janela comum" |
| `resizable` | `true`, mas o `will-resize` trava a altura | só a largura pode mudar com o mouse |
| `backgroundThrottling` | `false` | o renderer continua ativo mesmo oculto |
| `type: 'panel'` | só macOS | comportamento de painel flutuante |

Também cancela o evento `minimize` (`event.preventDefault()`), para que nada minimize o overlay.

### 1.3 Arrastar
**[Observado]** CSS: `-webkit-app-region: drag` no container da barra e `no-drag` nos botões. É o próprio sistema que move a janela, sem JavaScript, com o arrasto suave. Como alternativa, `Ctrl+setas` move a janela 20 px quando o modo interativo está desligado.

### 1.4 Modo interativo × click-through
**[Observado]** Um modo global alterna todas as janelas entre:
- **interativo:** `setIgnoreMouseEvents(false)`;
- **atravessável:** `setIgnoreMouseEvents(true, { forward: true })`. O clique passa para o app de trás, mas os eventos de movimento do mouse continuam chegando ao renderer.

A troca é por atalho (`Alt+A` / `Ctrl+Shift+I`), e um ponto colorido na barra mostra o modo atual. O renderer é avisado pelo evento `interaction-mode-changed`.

**[Verificado]** Pela documentação do Electron, `forward: true` **para de funcionar temporariamente quando a janela ativa roda com nível de integridade maior** (ex.: um app ou jogo aberto como administrador).

### 1.5 Sempre no topo
**[Observado]** No Windows, chama `setAlwaysOnTop(true)` sem nível e **reforça repetidamente**: em `blur`, `show`, `focus` e `restore` (com atrasos de 50/200/500 ms) e num `setInterval` a cada 3 s. No macOS, tenta em ordem os níveis `screen-saver` → `pop-up-menu` → `floating`.

**[Verificado]** Pela documentação: no Windows, os níveis de `floating` até `status` ficam **abaixo da barra de tarefas**; de `pop-up-menu` para cima, **acima da barra de tarefas**. O `setAlwaysOnTop(true)` sem nível usa `floating`. Por isso o OpenCluely precisa ficar reforçando.

### 1.6 Ocultar da captura
**[Observado]** `setContentProtection(true)` em todas as janelas.
**[Verificado]** No Windows, isso chama `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`. No Windows 10 2004+ a janela some da captura; em versões mais antigas, aparece um retângulo preto. No Linux não funciona.

**[Observado]** Há também um "modo compartilhamento" que esconde as janelas e as joga para `(-10000, -10000)`. Mas o próprio código comenta que `desktopCapturer.getSources()` **não consegue detectar se outro app está compartilhando a tela**, então essa detecção não funciona de verdade.

### 1.7 Várias janelas pré-criadas e "presas" entre si
**[Observado]** Todas as janelas (barra, chat, resposta, configurações) são criadas no início e ficam ocultas; mostrar e esconder é instantâneo. A janela de resposta fica **"presa" logo abaixo da barra**, com 10 px de espaço (`positionBoundWindows`): ao mover a barra, as duas andam juntas, sempre limitadas à `workArea` do monitor.

### 1.8 Mostrar sem trocar de área de trabalho
**[Observado]** `showOnCurrentDesktop()`: liga `setVisibleOnAllWorkspaces(true)`, chama `show()` + `focus()` e depois desliga o "todas as áreas de trabalho".
**[Verificado]** `setVisibleOnAllWorkspaces` **não faz nada no Windows**.

### 1.9 Atalhos globais
**[Observado]** `globalShortcut.register` com `CommandOrControl+Shift+<tecla>` e `Alt+<tecla>`, todos registrados num só lugar. `unregisterAll()` ao sair.

### 1.10 Disfarce de processo
**[Observado]** Troca o nome do processo e do app para "Terminal ", troca o ícone do Dock e o título das janelas. É para o app **se passar por outro programa**.

---

## 2. O que levamos, o que adaptamos e o que descartamos

| # | Técnica | Decisão | Como fica no sharescreen |
|---|---|---|---|
| 1 | Janela do tamanho do conteúdo (`setContentSize` a partir do DOM) | **Levar** | O pill mede a si mesmo com `ResizeObserver` (não com `setTimeout`, como o OpenCluely) e pede o tamanho por IPC. Mudanças de estado (recolhido → compacto → expandido) só redimensionam |
| 2 | `frame:false`, `transparent`, `#00000000`, `hasShadow:false`, `thickFrame:false`, `skipTaskbar` | **Levar** | Igual. A sombra vem do CSS dentro do container, não do sistema |
| 3 | `-webkit-app-region: drag` | **Levar** | A alça do pill é `drag`; avatares e botões são `no-drag`. Ao soltar, encaixa na borda mais próxima e salva a posição por monitor |
| 4 | Mover por teclado | **Adaptar** | Atalho opcional para mandar o pill para um canto (pós-MVP). Não ocupa `Ctrl+setas`, que os jogos usam |
| 5 | Modo atravessável global por atalho | **Adaptar** | Ver 3.2: o padrão é sempre clicável, porque a janela é pequena. Click-through total entra como "modo fantasma" opcional, por atalho, com aviso visual |
| 6 | `forward:true` para detectar hover | **Usar com cautela** | Não dependemos dele, por causa da limitação com apps em modo administrador (comum em jogos). Ver risco R14 |
| 7 | `setAlwaysOnTop(true)` + reforço a cada 3 s | **Trocar** | `setAlwaysOnTop(true, 'screen-saver')`, que fica acima da barra de tarefas pela documentação. Reforço **só por evento** (`blur`, `show`, `display-metrics-changed`), sem `setInterval`. Medir no Spike S1 se isso basta sobre jogos em janela sem bordas |
| 8 | `setContentProtection(true)` | **Levar, com propósito oposto** | Para nós não é para "esconder" o app: é para o **pill não aparecer na sua própria transmissão** (US18). Vai no pill e nos painéis, não no viewer |
| 9 | Detectar compartilhamento e esconder | **Descartar** | Não funciona (o próprio código admite). E nós sabemos quando o usuário transmite, porque a transmissão é nossa |
| 10 | Pré-criar todas as janelas | **Adaptar** | Pré-criar só o **pill** e o **painel** (abrir rápido importa). Viewer e seletor de tela são criados sob demanda (economia de RAM) |
| 11 | Janelas presas entre si (`positionBoundWindows`) | **Levar** | O painel abre preso ao pill, do lado que tiver espaço (abaixo/acima/esquerda/direita, conforme a borda onde o pill está), e anda junto ao arrastar |
| 12 | `show()` + `focus()` | **Trocar** | Pill com `showInactive()` e `focusable: false`: **nunca tira o foco do jogo**. **[Verificado]** No Windows, `focusable:false` também implica `skipTaskbar`. O painel é focável, porque tem campos de texto (login, nome do canal) |
| 13 | `backgroundThrottling:false` | **Levar, só onde precisa** | No pill, porque ele guarda a sessão da chamada (`Room` do LiveKit) e não pode ser congelado oculto. Nas outras janelas fica o padrão |
| 14 | `setVisibleOnAllWorkspaces` | **Ignorar no Windows** | Não faz nada lá; só entra quando houver macOS |
| 15 | Bloquear `minimize` | **Levar** | No pill e no painel |
| 16 | Atalhos centralizados + `unregisterAll` | **Levar** | Um `HotkeyService` com a lista configurável pelo usuário; conflito de atalho mostra aviso em vez de falhar calado |
| 17 | Disfarce de processo ("Terminal") | **Descartar** | O sharescreen aparece com o próprio nome e ícone no Gerenciador de Tarefas. Não queremos nada que se passe por outro programa |
| 18 | GPU desligada no Linux | **Não se aplica agora** | Anotado para quando houver versão Linux |
| 19 | `contextIsolation` sem `sandbox` | **Manter o nosso** | Mantemos `sandbox: true` + allowlist de IPC |

---

## 3. Arquitetura do overlay no sharescreen

### 3.1 Superfícies (substitui a janela principal de 3 colunas)

O app passa a ser **overlay-first**. Não existe mais uma "janela do app" no estilo Discord: tudo acontece em superfícies pequenas, presas ao pill.

```
                      ┌────────────────────────────┐
  PILL (sempre)       │ ⋮  ◉ ◉ ◎ +2   🎤  🔴         │  ← janela 1: overlay, não focável
                      └────────────────────────────┘
                      ┌────────────────────────────┐
  PAINEL (sob clique) │  Canais · Controles · Você │  ← janela 2: presa ao pill, focável
                      │  ...                        │
                      └────────────────────────────┘
  SELETOR DE TELA (modal sob demanda)  ·  VIEWER (janela normal sob demanda)  ·  BANDEJA
```

| Janela | Criação | Foco | Topo | Captura | Tamanho |
|---|---|---|---|---|---|
| **Pill** | no início, fica viva | `focusable:false`, `showInactive` | `screen-saver` | protegida | do conteúdo |
| **Painel** | no início, oculta | focável | `screen-saver` | protegida | do conteúdo, preso ao pill |
| **Seletor de tela** | sob demanda | focável, modal | `screen-saver` | protegida (não aparece em si mesmo) | fixo |
| **Viewer** | sob demanda | normal | normal (pode fixar no topo) | **não** protegida | redimensionável |
| **Bandeja** | no início | — | — | — | — |

Login, cadastro e criar/entrar em servidor também acontecem **no painel**, centralizado na tela na primeira execução. Não existe janela de login separada.

### 3.2 Regra do clique
1. **Padrão: sempre clicável.** Como a janela tem o tamanho do conteúdo, não há área morta para atravessar.
2. A pequena margem transparente da sombra CSS fica fora da janela: a sombra é desenhada dentro, com `padding` mínimo.
3. **"Modo fantasma"** (opcional, por atalho): `setIgnoreMouseEvents(true, { forward: true })` no pill, com opacidade reduzida e um ícone de cadeado. Serve para quem quer o pill sobre a área de jogo. Sai pelo mesmo atalho (não depende de hover, por causa da limitação do `forward`).

### 3.3 Posição
- Âncoras: 4 cantos + meio das bordas superior e inferior. Ao soltar o arrasto, encaixa na âncora mais próxima a até 24 px, ou fica livre.
- Salva `{ displayId, âncora | x,y }`. Se o monitor sumir, volta ao canto superior esquerdo do monitor principal.
- O painel abre para o lado com espaço: pill no topo, painel abaixo; pill embaixo, painel acima.
- Tudo limitado à `display.workArea`, que já desconta a barra de tarefas.

### 3.4 Fluxo de mensagens (pill ⇄ main)
```
renderer (pill) ── ResizeObserver ──► ipc 'overlay:resize' {w,h} ──► main: setContentSize + reposiciona painel
renderer (pill) ── clique ──────────► ipc 'panel:toggle' {aba}   ──► main: posiciona preso ao pill, showInactive/focus
main ── 'overlay:mode' {ghost} ─────► renderer: troca visual (opacidade, cadeado)
```
Todos os canais entram em `packages/shared/src/ipc.ts`, seguindo a regra do projeto.

---

## 4. Direção de design (substitui a janela genérica)

O que foi construído até agora, uma janela de 3 colunas imitando o Discord, **sai**. O que fica do Discord são a **paleta**, a **iconografia arredondada** e a **gramática de voz**: anel verde de fala, selos de mudo e "ao vivo", avatar redondo.

Princípios do overlay:
1. **Um objeto, não uma janela.** O pill é uma cápsula física que você move pela tela, e não um app em miniatura. Nada de barra de título, abas ou menus no estado normal.
2. **Silencioso por padrão.** Ninguém falando = pill quieto e esmaecido. Alguém falando = anel verde e brilho sutil. Alguém transmitindo = selo vermelho pulsando devagar. O movimento só aparece quando há informação.
3. **Informação no avatar, não em texto.** Estado (falando, mudo, ensurdecido, ao vivo, reconectando) vem por anel, selo e opacidade do avatar. O nome aparece no hover ou no modo "com nomes".
4. **Controles atrás de um gesto.** Clicar no grupo de avatares expande os controles no próprio pill. Clicar no seu avatar abre o painel "Você" (dispositivos, perfil). Clique direito num participante abre volume e mutar localmente.
5. **O painel é uma extensão do pill**, com o mesmo material, borda e raio, como se o pill "desdobrasse".
6. **Denso e legível sobre qualquer fundo.** Material escuro com desfoque (validar no S1), borda de 1 px clara para destacar sobre jogos escuros, texto nunca abaixo de 12 px.

As medidas e cores continuam nos tokens de [04-design-system](04-design-system.md). A próxima etapa de design é desenhar o pill e o painel nos três estados, a partir desses princípios, antes do código do S1.

---

## 5. Impacto no plano

- **[02-arquitetura](02-arquitetura.md):** janelas passam a ser pill, painel, seletor e viewer; sai a "janela principal".
- **[04-design-system](04-design-system.md):** sai o layout de 3 colunas; entra a anatomia pill + painel.
- **[05-roadmap](05-roadmap.md):** o Spike S1 ganha a lista de verificação abaixo.
- **[06-riscos](06-riscos.md):** novo risco R14 (`forward` com apps em modo administrador).
- **Código (`apps/desktop`): feito.** `OverlayManager` (`src/main/overlay/`) cria o pill e o painel; o renderer tem `pill/` e `panel/`; `HotkeyService` e bandeja (`tray.ts`). Falta validar no Windows a lista abaixo.

### Lista de verificação do Spike S1 (derivada deste estudo)
- [ ] Pill do tamanho do conteúdo via `ResizeObserver` → `setContentSize`, sem área transparente sobrando
- [ ] `setAlwaysOnTop(true, 'screen-saver')` fica acima da barra de tarefas e de um jogo em janela sem bordas, **sem** `setInterval`
- [ ] `focusable:false` + `showInactive()`: clicar no pill **não** tira o foco do jogo (o teclado continua no jogo)
- [ ] `setContentProtection(true)`: o pill não aparece no OBS nem na captura do próprio app
- [ ] `-webkit-app-region: drag` na alça + encaixe nas âncoras + posição salva por monitor
- [ ] Painel preso ao pill abre para o lado certo nas 4 bordas
- [ ] Modo fantasma por atalho funciona com um app em modo administrador em foco
- [ ] `backdrop-filter` funciona em janela transparente no Windows 11 (senão, usar fundo sólido semitransparente)
- [ ] RAM e CPU do pill ocioso medidas e anotadas
