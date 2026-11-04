# 10 — Próximos passos: do layout aprovado ao app funcionando

O layout do pill e do painel está **aprovado**. Este documento reorganiza o [roadmap](05-roadmap.md) para **ver o app funcionando o quanto antes**: primeiro voz real, depois tela compartilhada, e só então contas, convites e acabamento.

Cada marco termina com algo que dá para **usar e mostrar**. Tamanhos relativos: P (pequeno), M (médio), G (grande).

```
 M1 Ligação ─► M2 Tela ─► M5 Som do app ─► M6 Entrega ─► M7 Moderação ─► M8 Hospedar, achar e idiomas     M3 Contas · M4 Convites
     ✅          ✅           ✅              ✅            ✅               ✅                                ⏸ adiados
```

> **Decisão (03/11/2026):** M3 e M4 foram adiados. A entrada continua aberta só com um nome (`POST /join`, desligável com `OPEN_JOIN=false`), e a porta padrão passou a ser **7870**. O servidor é distribuído como um pacote de um clique, que sobe o LiveKit junto.

## Validação no Windows (o que só dá para confirmar aí)

Tudo abaixo foi implementado e testado no Linux do ambiente de desenvolvimento, com duas instâncias, LiveKit 1.13.11, microfone/câmera falsos do Chromium e um tom de teste no lugar do som nativo. O que depende do Windows ainda precisa de você:

- [ ] Voz real com fone: as duas instâncias se ouvem; mudo e ensurdecer
- [ ] Clicar no pill durante um jogo em janela sem bordas **não** tira o foco do jogo
- [ ] O pill fica acima da barra de tarefas e **não aparece** no OBS nem na transmissão
- [ ] Compartilhar **um aplicativo** com som: quem assiste ouve só o som daquele app
- [ ] Compartilhar **a tela inteira** com som: quem assiste **não** ouve as vozes da chamada (sem eco)
- [ ] Fechar o app compartilhado encerra a transmissão sozinho
- [ ] `bun run package` gera o instalador e o servidor; o instalador instala e abre; o servidor sobe com um duplo clique
- [ ] Memória do app em uso normal (Bandeja → Ajuda → Copiar diagnóstico mostra o total)
- [ ] RNNoise: com ventilador ou teclado barulhento, o outro lado não ouve o ruído; desligar a opção no Áudio traz o ruído de volta
- [ ] "Fluido" (60 fps): o log mostra `captura 1920x1080 a 60 fps` e quem assiste vê movimento suave num jogo
- [ ] Lista de pessoas: abre ao lado do pill, clique direito funciona, e fechar com Esc
- [ ] Sons do app saem no fone escolhido em "Saída de som"
- [ ] Hospedar pelo app instalado: o Windows pede o firewall para o `accord-server.exe` e o `livekit-server.exe`; fechar o app encerra os dois
- [ ] Um segundo PC na mesma rede **e** um no Radmin VPN veem o canal em "Canais encontrados" sem digitar nada
- [ ] Recortar um GIF de verdade (da internet): a foto continua animada para os outros

---

## M1 — Primeira ligação (G) · ✅ implementado

> **Status (03/11/2026):** tudo da tabela abaixo está no código. Foi testado com duas instâncias + LiveKit 1.13.11 + API: as duas se veem, o áudio remoto toca, o anel de fala acende, mudo e ensurdecido aparecem do outro lado (o mudo chegou na hora), e sair atualiza a lista. **Falta você testar no Windows** com fone e microfone de verdade, e a lista do S1 sobre um jogo.

**Resultado:** duas instâncias do app (no mesmo PC ou em dois PCs da mesma rede) entram num canal e conversam por voz. O pill mostra os participantes **de verdade**: anel verde de quem fala, mudo, ensurdecido, sair.

Sem contas ainda: cada um digita um nome e entra no canal "Geral". É um atalho de desenvolvimento que o M3 substitui.

| # | Tarefa | Onde |
|---|---|---|
| 1.1 | Baixar o `livekit-server.exe` para `infra/bin/` e subir com `bun run livekit:dev` | `infra/` |
| 1.2 | Rota `POST /dev/token { name }` → token LiveKit para a sala `geral` (**hoje é `POST /join`, entrada aberta também em produção**) | `apps/api` |
| 1.3 | Rodar **duas instâncias no mesmo PC** para testar: `--profile=<nome>` libera a trava de instância única e separa as pastas de dados | `apps/desktop/src/main` |
| 1.4 | `LiveKitSession` + `CallStore` (Zustand) **no pill**: conectar, publicar microfone, tocar o áudio remoto e transformar os eventos em `ParticipantState` | `src/renderer/pill/call/` |
| 1.5 | Controles reais no pill: mutar, ensurdecer (silencia o áudio remoto + muta), sair | `Pill.tsx` |
| 1.6 | Aba **Canais** provisória: campo "Seu nome" + "Entrar no Geral" | `Panel.tsx` |
| 1.7 | Estado da chamada também no painel (pill → main → painel por IPC) | `shared/ipc.ts` |
| 1.8 | Os participantes de exemplo saem do caminho padrão (só aparecem com `VITE_OVERLAY_DEMO=1`) | `demo.ts` |
| extra | Cor do avatar pelo nome e sem verde/vermelho (não confundir com "falando" e "mudo") | `packages/ui` |

✅ **Pronto quando:** duas instâncias se ouvem; o anel verde acompanha a fala; mutar aparece para o outro em menos de 0,5 s; sair e entrar de novo funciona.
⚠️ **Teste com fone de ouvido.** Duas instâncias no mesmo PC sem fone geram microfonia.

---

## M2 — Compartilhar tela com áudio (G) · ✅ implementado

> Testado: seletor (abas Telas e Aplicativos, "Tela inteira" em português), transmissão com o selo AO VIVO, pill de quem assiste recebendo **só a voz** (nenhum vídeo), viewer abrindo pelo selo com vídeo e **som** (tom de 440 Hz medido no viewer), espectador invisível na lista, aviso de "transmissão terminou". O som nativo do Windows entrou direto (ver M5), então os itens 2.3/2.4 abaixo foram resolvidos de outro jeito.

**Resultado:** pelo pill, você escolhe uma **tela inteira** ou um **aplicativo**, transmite com áudio, e o outro abre a transmissão numa janela própria, em tela cheia.

| # | Tarefa |
|---|---|
| 2.1 | Janela **seletor de tela** (abas Telas · Aplicativos, miniaturas e ícones; nada de guias de navegador) |
| 2.2 | `setDisplayMediaRequestHandler` entrega a fonte escolhida; publicar o vídeo com simulcast e os presets (texto/padrão/jogo) |
| 2.3 | Áudio da **tela inteira**: `audio: 'loopback'`. Medir se há **eco das vozes da chamada** (Spike S3a) e registrar o resultado |
| 2.4 | Áudio de **aplicativo**: no M2, transmite sem áudio, com aviso na tela; o áudio só do app chega no M5 |
| 2.5 | Selo **AO VIVO** real, parar, trocar de fonte, encerrar sozinho se a janela compartilhada fechar |
| 2.6 | **Viewer**: abrir pelo selo AO VIVO, receber o vídeo só sob demanda, tela cheia, volume da transmissão |

✅ **Pronto quando:** A transmite um jogo com som; B assiste em tela cheia; o pill de A não aparece na transmissão.

---

## M7 — Moderação, perfil e aparência (G) · ✅ implementado (04/11/2026)

> Testado com duas instâncias (uma como dono pelo `localhost`, outra como membro pelo IP da máquina): foto e nome mudam na hora para o outro; o menu do dono tem as 6 ações e o de um admin sobre o dono só as 2 "para mim"; mutar para todos bloqueia o microfone (e o membro não consegue religar); promover a admin e desconectar funcionam; RNNoise liga no microfone; "Fluido" capturou 1920×1080 a 60 fps; o tema e a imagem de fundo valem em todas as janelas.

| # | O que | Onde |
|---|---|---|
| 7.1 | **Papéis:** dono = quem entra pelo próprio PC do servidor; admin = promovido pelo dono. Guardados só no servidor | `apps/api/src/services/roles.ts` |
| 7.2 | `POST /moderate` (token da chamada no `Authorization`): mutar microfone/áudio da transmissão **para todos** (tira a permissão de publicar, como o "silenciar no servidor" do Discord, e vale mesmo se a pessoa sair e voltar com o mesmo nome), tornar/remover admin, desconectar | `routes/moderate.ts` |
| 7.3 | **Mutar para mim** (voz e som da transmissão), guardado pelo nome neste PC; a voz mutada deixa de ser recebida | `shared/localMutes.ts`, `callStore.ts`, `Viewer.tsx` |
| 7.4 | Pill só com você e os **controles sempre visíveis**; botão de **pessoas** abre a lista ao lado | `Pill.tsx`, `people/` |
| 7.5 | **Perfil:** nome e foto (GIF animado inclusive). A foto vai para o servidor (`POST /avatar`, nome = hash) e os outros baixam por `/avatars/…` | `ProfileTab.tsx`, `routes/avatars.ts` |
| 7.6 | **RNNoise** no microfone (`@sapphi-red/web-noise-suppressor`, wasm + AudioWorklet a 48 kHz); com ele ligado, o filtro do Chromium desliga | `pill/call/noise.ts` |
| 7.7 | **Sons do app** sintetizados (sem arquivos): mic, fone, entrar, sair, alguém chegou/saiu, começar/parar transmissão | `pill/call/sounds.ts` |
| 7.8 | Qualidade **Fluido**: 1080p a 60 fps, ~8 Mbps, mantém a fluidez quando a banda aperta | `screenShare.ts` |
| 7.9 | **Aparência:** 6 paletas, 8 cores editáveis (o resto é derivado com `color-mix`) e imagem de fundo com opacidade até 60% | `AppearanceTab.tsx`, `shared/theme.ts` |
| 7.10 | Seção **Áudio** recolhível, começa fechada e fecha de novo quando o painel some | `ChannelsTab.tsx` |

**Limites conhecidos:** papel de admin não sobrevive a sair e entrar (a identidade muda a cada entrada; o dono promove de novo). Os papéis e bloqueios ficam na memória do servidor: reiniciar o servidor zera.

---

## M8 — Hospedar, achar canais, recorte de foto e idiomas (G) · ✅ implementado (04/11/2026)

> Testado com duas instâncias: A hospedou pelo app (status "running" em ~2 s) e entrou como dono; B achou o canal na lista (com o nome do PC, o canal Geral e "1 pessoa") e entrou; endereço inválido mostra o erro; foto PNG e GIF recortadas (o GIF sai GIF, animado); idioma inglês troca todas as janelas na hora (menu de clique direito incluído); parar de hospedar encerra a API e o LiveKit sem deixar processos.

| # | O que | Onde |
|---|---|---|
| 8.1 | **Hospedar pelo app**: `HostService` sobe o servidor como processo filho (instalado: `resources/server/` vindo do `package:server`; desenvolvimento: `bun` + `infra/bin`). Mostra os endereços por rede (local, Radmin, Tailscale) para passar aos amigos | `src/main/network/host-service.ts` |
| 8.2 | **Achar canais**: localhost e endereços salvos; pergunta em broadcast UDP na porta **7871** (rede local e Radmin VPN); vizinhos da tabela ARP; peers do Tailscale; varredura do /24 da rede local. Tudo confirmado com `GET /info` | `src/main/network/discovery.ts`, `apps/api/src/services/discovery.ts`, `routes/info.ts` |
| 8.3 | **Adicionar endereço** (IP ou IP:porta), salvo na lista; **Guia** com como criar e como achar um canal | `ChannelsTab.tsx` |
| 8.4 | **Recorte da foto**: arrastar, zoom (controle ou rodinha), recorte redondo; GIF recortado quadro a quadro com `ImageDecoder` + `gifenc` (MIT), continua animado | `AvatarCropper.tsx`, `shared/crop.ts` |
| 8.5 | **Idiomas** PT-BR e EN: dicionários em `packages/shared/src/i18n/`, idioma salvo no main e avisado a todas as janelas; servidor responde com códigos de erro | `useT()` em `renderer/shared/i18n.ts` |
| 8.6 | Nome só na aba Você; fora da chamada o pill não tem seta de recolher; painel com 360 px | `Pill.tsx`, `ChannelsTab.tsx` |

### Correções de 04/11/2026 (depois do primeiro teste no Windows)

- **Painel fechava ao escolher arquivo** (foto, fundo): a janela do sistema tirava o foco e o painel fecha ao perder o foco. Agora o painel fica "segurado" enquanto a janela de arquivos está aberta (`panel.hold`, `shared/filePicker.ts`).
- **GIF ficava parado**: o `ImageDecoder` só conta os quadros depois de `tracks.ready`; sem esperar, `frameCount` vinha 1 e o GIF saía com um quadro só. Quem já tinha colocado um GIF precisa escolher de novo.
- **Cliques paravam de funcionar** (principalmente depois de Ctrl+Shift+O): o pill não usa mais `-webkit-app-region: drag` (o arrasto é feito pelo main seguindo o cursor) e ocultar o overlay agora deixa o pill invisível e "atravessável" em vez de `hide()`/`showInactive()`. [Hipótese] a causa era a região de arrasto desatualizada da janela transparente; validar no Windows.
- **Tela inteira com o som do app**: a captura já exclui a árvore de processos do app (o serviço de áudio é filho do processo principal). O log agora mostra os pids envolvidos. [Hipótese] o som captado vinha de uma segunda instância do app no mesmo PC (outra árvore de processos, que o Windows não deixa excluir junto).
- Qualidades: saiu 1080p a 15 fps, entrou **720p a 60 fps** ("Leve e fluido", ~4 Mbps).

**Limites conhecidos:** Tailscale não repassa broadcast (por isso os peers vêm do `tailscale status`); se o Radmin bloquear o broadcast, o PC só aparece depois de algum tráfego com ele (tabela ARP) ou pelo endereço manual.

---

## M3 — Contas, canais e presença (G)

**Resultado:** o painel deixa de ser provisório: cadastro, login, foto, vários canais e a lista mostrando quem está em cada canal antes de entrar.

| # | Tarefa |
|---|---|
| 3.1 | API: cadastro, login, refresh e logout (argon2id); refresh guardado com `safeStorage` |
| 3.2 | Painel: login/cadastro, perfil e avatar (o primeiro usuário vira dono do servidor) |
| 3.3 | Canais: criar, renomear, ordenar, apagar; `POST /channels/:id/join` → token. **Restringe o `/join`** |
| 3.4 | Presença: webhooks do LiveKit → API → WebSocket → aba Canais em tempo real |
| 3.5 | Volume por pessoa (no menu de clique direito da lista de pessoas) |
| 3.6 | Push-to-talk com hook de teclado nativo (Spike S5) |

✅ **Pronto quando:** três pessoas com conta trocam de canal e todos veem a presença certa sem recarregar.

---

## M4 — Amigos de fora da sua rede (M)

**Resultado:** você clica em "Criar meu servidor", manda um link e um amigo de outra cidade entra.

| # | Tarefa |
|---|---|
| 4.1 | `HostService`: o app sobe o `livekit-server` e a API (compilada em `.exe`) como processos filhos, com chaves geradas por instalação e UDP numa porta só (7882) |
| 4.2 | Convites (expiração, limite de usos, revogar) + links `sharescreen://join?...` |
| 4.3 | Assistente de conexão: detecta IP do **Radmin** (`26.x`) e do **Tailscale** (`100.x`), preenche o endereço e testa se o amigo alcança |
| 4.4 | Resolver a conexão sem TLS (`ws://`) vinda do app (risco R9) |

✅ **Pronto quando:** um amigo fora da sua rede entra pelo link, fala e assiste à sua tela.

---

## M5 — Áudio só do aplicativo, sem eco (M) · ✅ implementado (validar no Windows)

> Feito com o pacote **loopback-capture** (MIT, binário N-API pronto para Windows x64, sem compilar nada): `start(pid)` para um app e `startSystemAudio(cb, process.pid)` para a tela inteira excluindo o próprio sharescreen. O PID da janela vem de `GetWindowThreadProcessId` (via **koffi**). O PCM vai do main ao pill por `MessagePort` → AudioWorklet (`pcm-player.worklet.js`) → faixa `ScreenShareAudio`. Para testar fora do Windows: `SHARESCREEN_FAKE_SHARE_AUDIO=1` troca a captura por um tom de 440 Hz (só em desenvolvimento).
>
> **Limitação conhecida:** apps da Microsoft Store/UWP rodam dentro de outro processo (ApplicationFrameHost), então "só o som do app" pode vir mudo para eles.

| # | Tarefa |
|---|---|
| 5.1 | Addon nativo com process loopback do WASAPI: **incluir** o processo escolhido (janela) ou **excluir** o próprio app (tela inteira) |
| 5.2 | PCM → AudioWorklet → track publicada como `ScreenShareAudio` |

✅ **Pronto quando:** compartilhar a janela A transmite só o som de A, e as vozes da chamada nunca voltam para quem assiste.

---

## M6 — Entrega (M) · ✅ implementado (falta só a atualização automática)

> - **Servidor de um clique:** `bun run package:server` gera `release/accord-server/` com `accord-server.exe` (API compilada) + `livekit-server.exe` + `LEIA-ME.txt`. A API sobe o LiveKit com chaves geradas na 1ª execução (`dados/chaves.json`) e mostra os IPs da máquina. Testado no Linux: duas instâncias conversaram pelo pacote.
> - **Instalador:** `bun run package:desktop` (NSIS, x64). Testado o empacotamento no Linux (`--linux dir`): app abre a partir do `.asar`, entra no servidor, o AudioWorklet carrega de `file://`, módulos nativos ficam fora do `.asar`.
> - **Logs e diagnóstico:** `%APPDATA%/Accord/logs/main.log` (gira em 1 MB), erros das janelas incluídos; bandeja → Ajuda → Copiar diagnóstico / Abrir pasta de logs.
> - **Mensagens de erro** sem comandos de desenvolvedor.
> - **Medição de memória (Linux, sem GPU, com o seletor aberto):** ~890 MB somando todos os processos (o "working set" conta memória compartilhada mais de uma vez). Próximas otimizações possíveis: criar o painel só quando abrir pela primeira vez; medir de novo no Windows.
> - **Pendente:** atualização automática (precisa de um repositório no GitHub com Releases); teste de usabilidade com 5–8 pessoas ([07](07-pesquisa-usuarios.md)).

Instalador NSIS com ícone, atualização automática, tratamento de erros e reconexão, logs e "copiar diagnóstico", teste de usabilidade do overlay ([07](07-pesquisa-usuarios.md)), revisão de acessibilidade, medição de RAM/CPU. **Pronto quando:** a v0.1.0 for instalada por 5–8 testadores.

---

## Validações no Windows que acompanham os marcos

A lista do Spike S1 ([09](09-estudo-overlay-opencluely.md#lista-de-verificação-do-spike-s1-derivada-deste-estudo)) entra **no M1**: com a chamada real, testar sobre um jogo de verdade que o foco não muda, que o pill fica acima da barra de tarefas e que não aparece no OBS.

## O que precisa vir de você

| Quando | O quê |
|---|---|
| M1 | Fone de ouvido para testar; rodar `bun install` + `bun run dev` quando eu avisar |
| M2 | Um jogo ou vídeo para testar o áudio da tela inteira |
| M4 | Um amigo ou um segundo PC **fora da sua rede**, com Radmin ou Tailscale instalado |

## Fora destes marcos (backlog)

Chat de texto, câmera, vários servidores por conta, macOS/Linux, nuvem ([02](02-arquitetura.md#migração-para-servidor-escalonável)).
