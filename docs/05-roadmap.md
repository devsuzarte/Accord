# 05 — Roadmap

> **Ordem de execução atual:** [10-proximos-passos](10-proximos-passos.md). Com o layout aprovado, a voz real vem antes das contas, para ver o app funcionando mais cedo. As fases abaixo continuam valendo como lista de tarefas e definição de pronto.

Os tamanhos são relativos (P/M/G); as durações reais dependem da sua disponibilidade. Cada fase termina com algo **usável** e **medido**.

## Fase 0 — Spikes técnicos (fazer primeiro)

Código descartável, um repositório/pasta por spike. O objetivo é responder às **[Hipóteses]** da arquitetura.

| # | Spike | Pergunta a responder | Pronto quando |
|---|---|---|---|
| S1 | Overlay (pill + painel) | Lista de verificação completa em [09-estudo-overlay-opencluely](09-estudo-overlay-opencluely.md#lista-de-verificação-do-spike-s1-derivada-deste-estudo): tamanho pelo conteúdo, topo `screen-saver` sem polling, não roubar foco do jogo, `setContentProtection`, arrastar/encaixar, painel preso, modo fantasma, `backdrop-filter` | GIF do pill sobre um jogo sem roubar foco + captura do OBS sem o pill |
| S2 | Captura + LiveKit | Seletor próprio com `desktopCapturer` → `getDisplayMedia` → publicar no `livekit-server --dev` → outra instância assiste. Medir CPU/RAM em 720p30 e 1080p30. Viewer em janela separada: segunda conexão ou repasse de track? | Duas instâncias na LAN, uma transmitindo e a outra vendo |
| S3 | Áudio da tela | (a) `audio: 'loopback'` gera eco das vozes da chamada? (b) `loopback-capture` captura por PID dentro do Electron? Tem modo excluir? (c) Latência e sincronia do PCM → AudioWorklet → track publicada como `ScreenShareAudio` | Transmissão de uma janela com o som só dela, sem eco |
| S4 | Rede do host | `livekit-server` + API rodando como processos filhos; conexão de fora via Tailscale e via encaminhamento de portas (7880 TCP, 7881 TCP, 7882 UDP). Conectar do app a `ws://` sem TLS é aceito? | Um amigo em outra rede entra e fala |
| S5 | PTT | `globalShortcut` não detecta soltar a tecla. Testar `uiohook-napi` | PTT funcionando com o jogo em foco |

> **Status do S1:** a mecânica já está implementada em `apps/desktop/src/main/overlay/` e foi testada no Linux (tamanho pelo conteúdo, encaixe, painel preso, cantos, modo fantasma). Falta rodar a lista de verificação no **Windows**: foco do jogo, nível `screen-saver`, `setContentProtection` no OBS, arrasto com `focusable:false` e apps em modo administrador.

**Saída da Fase 0:** atualizar [02-arquitetura](02-arquitetura.md) e [06-riscos](06-riscos.md) com os resultados e trocar cada [Hipótese] por [Verificado] ou por uma decisão nova.

## Fase 1 — Fundação (M)
- [ ] Monorepo Turborepo + Bun workspaces; `packages/config` (tsconfig, eslint, prettier)
- [ ] `apps/desktop` com electron-vite, 3 entradas de renderer, preload `PlatformBridge`, segurança Electron
- [ ] `packages/ui`: tokens + Avatar, IconButton, Tooltip, Modal, Toggle, Slider, Toast
- [ ] `apps/api`: Elysia, Drizzle + SQLite, migrations, auth (register/login/refresh/logout), `/me`, avatar
- [ ] Pill + painel (do S1) como casca do app; login, cadastro e perfil dentro do painel
- [ ] CI (GitHub Actions): lint + typecheck + build
- **Pronto:** criar conta, logar, trocar foto, reabrir o app e continuar logado.

## Fase 2 — Canais e voz (G)
- [ ] CRUD de canais + papéis; aba Canais do painel
- [ ] `/channels/:id/join` → token LiveKit; `CallStore`; entrar/sair/trocar de canal
- [ ] Mic com processamento, mutar/ensurdecer, indicador de fala, volume por usuário
- [ ] Seleção e troca de dispositivos; teste de microfone
- [ ] Webhooks do LiveKit → presença em memória → WS → lista atualizada
- [ ] Atalhos globais (mutar/ensurdecer) + PTT (resultado do S5)
- [ ] Sons de entrada e saída
- **Pronto:** 3 pessoas na LAN conversando e trocando de canal, com a presença correta para todos.

## Fase 3 — Overlay (M)
- [ ] Janela overlay (resultado do S1); `UserPill`; estados recolhido/compacto/expandido
- [ ] Barra de controles ligada ao `CallStore`
- [ ] Arrastar, encaixe nas bordas, lembrar posição por monitor
- [ ] Configurações de overlay (opacidade, tamanho, nomes, máximo visível)
- [ ] Toasts no overlay; aviso de "você está mudo"
- [ ] Modo fantasma (click-through total) por atalho
- **Pronto:** passar uma partida inteira só pelo pill, sem o overlay roubar o foco do jogo nenhuma vez.

## Fase 4 — Compartilhamento de tela (G)
- [ ] Seletor de fonte (Telas | Aplicativos), presets de qualidade, toggle de áudio
- [ ] Publicar vídeo (simulcast) + áudio (addon do S3, ou plano B)
- [ ] Selo AO VIVO, parar e trocar fonte, fim automático ao fechar a janela
- [ ] Viewer: janela, tela cheia, volume, assinatura só sob demanda
- **Pronto:** compartilhar um app com o som dele e o outro lado assistir em tela cheia, sem eco.

## Fase 5 — Host mode e convites (M)
- [ ] Empacotar `livekit-server.exe` + API compilada (`bun build --compile`)
- [ ] `HostService`: iniciar/parar, gerar chaves, UDP mux 7882, logs
- [ ] Convites (criar, revogar, expirar, limite de usos) + protocolo `sharescreen://`
- [ ] Assistente de conexão: LAN / Tailscale / encaminhamento de portas, com teste de alcance
- **Pronto:** alguém sem conhecimento técnico cria o servidor e um amigo de outra cidade entra pelo link.

## Fase 6 — Polimento e entrega (M)
- [ ] Instalador NSIS, ícone, assinatura de código (opcional; sem ela o SmartScreen avisa)
- [ ] Auto-update via GitHub Releases
- [ ] Reconexão, estados de erro, mensagens (ver skill `ux-copy`), logs e diagnóstico
- [ ] Medir RAM/CPU/rede de novo contra o orçamento da Fase 0
- [ ] Teste de usabilidade do overlay ([07-pesquisa](07-pesquisa-usuarios.md)) e correções
- [ ] Revisão de acessibilidade (contraste, foco, leitor de tela na janela principal)
- **Pronto:** instalador v0.1.0 distribuído para 5–8 testadores.

## Pós-MVP (ordem sugerida)
1. Chat de texto nos canais
2. 1080p60 + escolha de codec (H.264/VP9/AV1, conforme o hardware)
3. Supressão de ruído (RNNoise via WASM) e sensibilidade de voz
4. Vários servidores por conta
5. Deploy em nuvem (VPS + TLS, ou LiveKit Cloud), Postgres e Redis
6. macOS (CoreAudio Tap / ScreenCaptureKit) e Linux (PipeWire)
7. Avaliar Tauri + LiveKit Rust SDK se o peso do Electron virar problema real

## Definição de pronto (vale para toda tarefa)
- Typecheck e lint passando; sem `any` em fronteiras de IPC/API
- Estados de carregando, vazio e erro tratados na UI
- Testado no Windows 11 (e no 10 22H2 quando mexer em captura/áudio)
- Documentação de `docs/` atualizada se mudou alguma decisão
