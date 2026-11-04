# Accord (antes "sharescreen"): contexto para o Claude Code

App desktop de voz + compartilhamento de tela em overlay, inspirado no Discord. Plano completo em `README.md` e `docs/`.

## Decisões fixas
- Electron (MVP), React + TS + electron-vite; Windows 10 2004+/11 primeiro
- LiveKit (SFU) self-hosted; API Elysia + Bun; SQLite + Drizzle
- Turborepo + Bun workspaces: `apps/desktop`, `apps/api`, `packages/ui`, `packages/shared`, `packages/config`
- UI e lógica de chamada não importam nada do Electron; todo acesso ao SO passa pelo `PlatformBridge` (preload)
- Segurança Electron: contextIsolation + sandbox + IPC em allowlist e payload validado
- Ícones Lucide, fonte Noto Sans, tokens em `packages/ui/tokens.css`; nunca usar marca, fonte, ícones ou sons do Discord
- Seletor de tela só com `screen` e `window` (sem guias de navegador)
- **Overlay-first**: sem janela principal. Superfícies = pill (não focável, tamanho do conteúdo, topo `screen-saver`, `setContentProtection`) + painel preso ao pill + seletor e viewer sob demanda. Ver `docs/09-estudo-overlay-opencluely.md`
- OpenCluely é só referência de estudo: não copiar código nem funcionalidades; nada de disfarce de processo

## Comandos
- `bun run dev` (API + desktop), `bun run typecheck`, `bun run lint`, `bun run format`, `bun run build`
- Migrations: editar `apps/api/src/db/schema.ts` → `bun run --cwd apps/api db:generate` → `db:migrate`
- Canal IPC novo: `packages/shared/src/ipc.ts` → `PlatformBridge` → `apps/desktop/src/preload` → `apps/desktop/src/main/ipc.ts`
- Pacotes do workspace são TS-fonte; no electron-vite eles ficam em `externalizeDeps.exclude`
- Overlay: `apps/desktop/src/main/overlay/overlay-manager.ts`. As superfícies medem o próprio conteúdo com `useReportSize` (ResizeObserver) e o main ajusta a janela. Movimentos feitos por código são marcados em `expectedPosition` para não serem tratados como arrasto
- Participantes de exemplo do pill: `src/renderer/shared/demo.ts` (só em dev, com `VITE_OVERLAY_DEMO=1`)
- Chamada: a `Room` do LiveKit vive no pill (`src/renderer/pill/call/callStore.ts`, Zustand). O painel manda `CallCommand` → main → pill; o pill publica `CallSnapshot` → main → painel
- Entrada aberta: `POST /join { name, viewer? }` (sala `geral`; `viewer: true` = token oculto e só-assistir). `OPEN_JOIN=false` desliga. Contas (M3) e convites (M4) adiados
- Porta padrão da API: 7870 (`packages/shared/src/defaults.ts`, `normalizeServerUrl` completa a porta)
- Compartilhamento: `src/main/share/` (seletor, `setDisplayMediaRequestHandler`, som nativo via loopback-capture + koffi, viewers). Pill recebe só vozes (`autoSubscribe: false`); o viewer tem conexão própria
- Som da transmissão: main → MessagePort (repassado pelo preload via `window.postMessage`) → `pcm-player.worklet.js` (importar com `?url&no-inline`: a CSP bloqueia data:)
- Testes sem Windows: `SHARESCREEN_FAKE_SHARE_AUDIO=1` (tom de 440 Hz no lugar do som nativo, só em dev)
- Pacotes: `bun run package:server` (API compilada sobe o LiveKit vizinho com chaves geradas) e `package:desktop` (NSIS). Logs em `app.getPath('logs')`
- Testar chamada sozinho: `bun run livekit:dev` + `bun run dev` + `bun run dev:second` (perfil separado via `--profile=`)
- Renderer com dependências só em devDependencies (o Vite empacota); `dependencies` do desktop = só módulos nativos do main
- Papéis: dono = quem entra pelo PC do servidor (loopback); admin = promovido pelo dono. Autorização só no servidor (`apps/api/src/services/roles.ts`); atributos do LiveKit (`role`, `avatar`, `serverMic`, `serverAudio`) são só para a interface
- Moderação: `POST /moderate` com o token da chamada no `Authorization: Bearer`. "Mutar para mim" é local, pelo nome (`src/renderer/shared/localMutes.ts`)
- Lista de pessoas: janela `people` (`src/main/overlay/people-window.ts`), recebe o `CallSnapshot` e manda `CallCommand` como o painel
- Perfil e tema: `src/main/settings/settings-store.ts` (profile.json, theme.json em userData) → `ProfileChanged`/`ThemeChanged` para todas as janelas. Toda página chama `startTheme()`; cores novas no CSS = tokens/`color-mix`, nunca hex fixo
- Idiomas: textos novos SEMPRE nos dois dicionários (`packages/shared/src/i18n/pt-BR.ts` e `en.ts`, mesmas chaves); no renderer `useT()`, fora do React `translateNow()`; no main `src/main/i18n.ts`. Erros da API voltam como código, não frase
- Hospedar e descoberta: `src/main/network/` (HostService, DiscoveryService). Porta de descoberta 7871/UDP (`DEFAULT_DISCOVERY_PORT`); o servidor confirma com `GET /info`
- RNNoise: `pill/call/noise.ts` (wasm e worklet com `?url&no-inline`; CSP do pill tem `'wasm-unsafe-eval'`). Sons: `pill/call/sounds.ts` (WebAudio, sem arquivos)

- Nome do produto: **Accord** (instalador, janelas, bandeja, textos). Os pacotes internos continuam `@sharescreen/*`, e as chaves de localStorage e o protocolo de descoberta mantêm o prefixo `sharescreen`
- Ícones: `apps/desktop/resources/` (`logo.svg` original, `icon.png`/`icon.ico` do app, `tray.png`/`tray@2x.png`)
- Build do Windows a partir do Linux funciona com wine + wine32 (o NSIS roda o desinstalador no wine) e o `@koromix/koffi-win32-x64` presente em node_modules

## Convenções
- Docs e UI em PT-BR
- Marcar suposições em docs como [Hipótese] até validar; nunca inventar comportamento de API sem checar a documentação
- Atualizar `docs/` quando uma decisão mudar
- O usuário roda `bun install` por conta própria no Windows
