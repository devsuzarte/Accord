# Accord

<p align="center"><img src="apps/desktop/resources/icon.png" width="128" alt="Accord"></p>

> App desktop de **voz + compartilhamento de tela** que roda como **overlay discreto** sobre o computador, com servidor **self-hosted pelo dono da sessão** e caminho de migração para nuvem. Inspiração visual e de fluxo: Discord (sem copiar marca, logo, fonte ou ícones proprietários).

## Baixar (Windows 10/11)

Baixe o **`Accord-Setup-<versão>.exe`** na página [Releases](https://github.com/devsuzarte/Accord/releases) e instale. O instalador já leva o servidor: quem for hospedar só clica em **Canais → Hospedar**; os outros vão em **Canais → Entrar**.

- O instalador ainda **não é assinado**: o Windows pode mostrar "O Windows protegeu o computador". Clique em **Mais informações → Executar assim mesmo**.
- Na primeira vez que hospedar, permita o **Firewall do Windows** em "Redes privadas".
- Amigos fora da sua casa: todos no mesmo **Radmin VPN** (ou Tailscale).

## Resumo das decisões

| Tema | Decisão | Por quê |
|---|---|---|
| Shell desktop | **Electron** (MVP) | Captura de tela + áudio do sistema já vem pronta (`desktopCapturer` + `setDisplayMediaRequestHandler` com `audio: 'loopback'`). No Tauri, a captura via webview ainda tem problemas em aberto no macOS/Linux. Ver [02-arquitetura](docs/02-arquitetura.md#decisão-electron-vs-tauri) |
| Mídia (SFU) | **LiveKit** self-hosted (binário único) | Roda local com `livekit-server --dev`; mesmo protocolo no LiveKit Cloud ou em cluster depois → migração sem reescrever cliente |
| Backend | **Elysia + Bun** | Emissão de token LiveKit (entrada aberta); contas, canais e convites depois |
| Banco | **SQLite + Drizzle** (MVP) → Postgres na nuvem | Zero infra no host; Drizzle troca o driver |
| UI | **React + TypeScript + Vite** (electron-vite), CSS com design tokens | Altamente estilizável, tema estilo Discord |
| Monorepo | **Turborepo + Bun workspaces** | `apps/desktop`, `apps/api`, `packages/ui`, `packages/shared` |
| Plataforma MVP | **Windows 10 (2004+) / 11** | Overlay excluído da captura e áudio por processo dependem de APIs do Win10 2004+ |

## Como rodar (desenvolvimento)

Pré-requisitos: **Bun 1.4+** e **Git**. O `livekit-server.exe` já está em `infra/bin/`.

```powershell
bun install                # instala tudo e baixa o binário do Electron

bun run livekit:dev        # terminal 1: servidor de voz (LiveKit)
bun run dev                # terminal 2: servidor do Accord (porta 7870) + app
bun run dev:second         # terminal 3 (opcional): segunda instância para testar sozinho
```

**Testar uma ligação:** defina seu nome (e a foto, se quiser) na aba **Você**. Em **Canais → Hospedar**, clique em **Hospedar agora** e depois em **Entrar no meu canal**. Na segunda instância, use outro nome e vá em **Canais → Entrar**: o canal aparece na lista.

**Compartilhar tela:** no pill, clique em **Compartilhar tela**, escolha uma tela ou um aplicativo, a qualidade (até **1080p a 60 fps** em "Fluido") e se quer transmitir o som, e clique em **Transmitir**. Quem estiver na chamada abre a lista de pessoas (ícone de pessoas, ao lado de sair) e clica no selo **AO VIVO**.

**Com outro PC na mesma rede (ou no Radmin/Tailscale):** o app procura sozinho os servidores na rede local, no Radmin VPN e nos PCs online do Tailscale. Se não aparecer, use **Adicionar endereço** com o IP (ou `IP:porta`, se não for a 7870). A aba **Guia** explica o passo a passo.

## Como distribuir

```powershell
bun run package            # gera as duas coisas abaixo (rode no Windows)
```

| Saída | O que é |
|---|---|
| `release/accord-server/` | **Servidor**: `accord-server.exe` + `livekit-server.exe` + `LEIA-ME.txt`. Um duplo clique sobe tudo, com chaves próprias geradas na primeira vez, e a janela mostra os IPs para os amigos usarem |
| `release/app/Accord-Setup-<versão>.exe` | **App**: instalador NSIS do Windows |

Portas para liberar no firewall de quem hospeda: **7870/TCP** (servidor), **7871/UDP** (para o app achar o servidor na rede), **7880–7881/TCP** e **7882/UDP** (voz e vídeo). O instalador do app já leva o servidor junto (botão Hospedar).

| Comando (na raiz) | O que faz |
|---|---|
| `bun run dev` | servidor com watch + app com HMR |
| `bun run dev:api` / `dev:desktop` | só um dos dois |
| `bun run livekit:dev` | servidor de voz local (chaves de desenvolvimento) |
| `bun run dev:second [perfil]` | outra instância do app com dados separados (precisa do `bun run dev` rodando) |
| `bun run package:server` / `package:desktop` | só o servidor / só o instalador |
| `bun run typecheck` · `lint` · `format` | TypeScript · ESLint · Prettier |

**Quando algo der errado:** no ícone da bandeja, **Ajuda → Copiar diagnóstico** (versões, sistema, memória e as últimas linhas do log) ou **Abrir pasta de logs** (`%APPDATA%\Accord\logs`).

### Estrutura

```
apps/desktop    Electron: main (overlay, compartilhamento, som nativo, viewer, atalhos, bandeja, logs),
                preload (PlatformBridge), renderer (pill, panel, people, picker, viewer)
apps/api        Elysia + Bun: /health, /join, /avatar, /moderate (dono e admins), LiveKit embutido no pacote do servidor
packages/ui     tokens.css, global.css, surface.css, Avatar, IconButton, useReportSize
packages/shared tipos, portas padrão, paletas, canais IPC, interface PlatformBridge
packages/config tsconfigs compartilhados
infra           livekit.yaml, livekit-dev.ts, bin/livekit-server.exe
```

O que já existe:
- **Overlay:** pill sempre no topo, do tamanho do conteúdo, não rouba foco, oculto da captura, arrastável pela lombada com encaixe nas bordas; painel preso ao pill; modo fantasma; bandeja; atalhos `Ctrl+Shift+O` (mostrar/ocultar) e `Ctrl+Shift+G` (fantasma).
- **Voz:** entrar no canal "Geral" com seu nome e foto; anel de fala, mudo, ensurdecido; supressão de ruído com **RNNoise** (liga e desliga no Áudio); sons ao mutar, ensurdecer, entrar, sair e quando alguém chega.
- **Pill:** só você e os controles, sempre visíveis (microfone, fone, tela, configurações, pessoas, sair). O botão de pessoas mostra quantos estão na chamada e um ponto vermelho quando alguém está ao vivo.
- **Lista de pessoas:** janela ao lado do pill. Clique direito numa pessoa: **Mutar microfone / áudio (para mim)**; o **dono** (quem entra pelo PC do servidor) também muta **para todos** e promove a **admin**; dono e admins **desconectam**.
- **Painel:** Canais (**Entrar** com a lista de canais encontrados e endereço manual, **Hospedar** pelo próprio app, **Guia**; seção Áudio recolhível), **Você** (nome, foto com recorte e zoom, GIF continua animado, e idioma), **Aparência** (6 paletas, 8 cores, imagem de fundo) e Overlay. Painel mais largo (360 px).
- **Idiomas:** português e inglês, em todas as janelas, na bandeja e nas mensagens do servidor. Na primeira vez, segue o idioma do sistema.
- **Tela:** seletor (telas/aplicativos, sem guias de navegador), 4 qualidades (até 1080p a 60 fps), selo AO VIVO, viewer sob demanda (conexão própria e invisível), som da transmissão capturado nativamente no Windows: tela inteira = tudo menos a chamada; aplicativo = só o som dele.
- **Chat temporário:** botão no pill. Aberto: mensagens, imagens (clique para ampliar), arquivos e o campo com anexar/enviar (também arrastar e colar). Minimizado: as mensagens rolam perto do pill, como num chat de live (imagens viram "abra o chat para ver"); dá para desligar em Overlay. Fica só no servidor de quem hospeda e some quando a sessão acaba.
- **Senha do canal:** quem hospeda define (ou troca com o canal aberto); os canais com senha aparecem com cadeado na lista.
- **Troca de host:** se o PC de quem hospeda cair, a sessão passa para quem entrou primeiro, que abre o próprio servidor com a cópia da sessão (senha, chat, anexos, silêncios); os outros reconectam no IP dele sozinhos.
- **Volume por pessoa:** 0% a 200%, só para você, no clique direito da lista de pessoas.
- **Segurança revisada** ([14](docs/14-seguranca.md)): ninguém se passa pelo dono nem assiste escondido, convite sem a senha, limite de tentativas, desconectar bloqueia por 15 minutos, sem programas pelo chat.
- **Aperte para falar** e atalhos de mutar/ensurdecer que funcionam com o jogo em foco (inclusive botões laterais do mouse).
- **Apontar na tela de quem transmite** e **miniatura da transmissão sobre o jogo**.
- **Convites por link:** "Copiar convite" gera um link que abre o Accord direto no canal (com a senha, se tiver). Funciona clicado no WhatsApp ou no Discord.
- **Qualidade no viewer:** selo com resolução e fps, painel com taxa, perda, atraso e travadas, diagnóstico de onde está o gargalo e opção Econômica (360p).
- **Entrega:** pacote do servidor de um clique, instalador, **atualização automática** pelo GitHub Releases, publicada sozinha pelo GitHub Actions ao criar uma tag ([12](docs/12-publicar-versao.md)), logs e diagnóstico.

Fora por enquanto: contas e vários canais (M3) e o assistente de conexão (M4). Ideias para os próximos passos: [13](docs/13-ideias.md). Para revisar o visual com **participantes de exemplo**, crie `apps/desktop/.env.development.local` com `VITE_OVERLAY_DEMO=1`.

## Documentos

1. [Visão do produto e escopo](docs/01-visao-produto.md) — problema, personas, user stories, dentro/fora do MVP
2. [Arquitetura](docs/02-arquitetura.md) — Electron vs Tauri, componentes, fluxos, modelo de dados, API, host mode
3. [Funcionalidades e critérios de aceite](docs/03-funcionalidades.md) — especificação de cada feature
4. [Design system e overlay](docs/04-design-system.md) — paleta, tokens, pill, estados, ícones, wireframes
5. [Roadmap](docs/05-roadmap.md) — spikes, fases, tarefas, definição de pronto
6. [Riscos e mitigações](docs/06-riscos.md)
7. [Pesquisa com usuários](docs/07-pesquisa-usuarios.md) — plano, roteiro de entrevista, teste de usabilidade do overlay
8. [Referências](docs/08-referencias.md) — fontes verificadas
9. [Estudo do overlay (OpenCluely)](docs/09-estudo-overlay-opencluely.md) — técnicas de janela, o que levamos/adaptamos/descartamos, arquitetura overlay-first e direção de design
10. [Próximos passos](docs/10-proximos-passos.md) — marcos M1–M9 até o app funcionando
11. [Pesquisa: supressão de ruído e login com Discord](docs/11-pesquisa-ruido-e-discord.md) — opções avaliadas e recomendação
12. [Publicar uma versão](docs/12-publicar-versao.md) — passo a passo da release e da atualização automática

## Legenda usada nos documentos

- **[Verificado]**: confirmado em documentação oficial (link em [08-referencias](docs/08-referencias.md))
- **[Hipótese]**: provável, mas precisa ser validado num spike antes de virar código de produção
- **[Decisão]**: escolha de projeto, pode ser revista

## Próximo passo

Testar no Windows (voz, tela com som, instalador e servidor) e seguir a lista de validação em [10-proximos-passos](docs/10-proximos-passos.md#validação-no-windows-o-que-só-dá-para-confirmar-aí).

## Contribuir

Contribuições são bem-vindas. Leia o [CONTRIBUTING.md](CONTRIBUTING.md) antes de abrir um pull request: ele explica como propor uma mudança, o que é conferido e como a revisão funciona. Falhas de segurança vão por um canal privado ([SECURITY.md](SECURITY.md)), nunca em issue pública. Todos seguem o [código de conduta](CODE_OF_CONDUCT.md).

## Licença

[Apache License 2.0](LICENSE) — veja também o [NOTICE](NOTICE). Ao enviar uma contribuição, você concorda que ela entra sob a mesma licença (seção 5 da Apache 2.0). O instalador também leva programas de terceiros (LiveKit, Electron, RNNoise e outros), cada um com a sua licença: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
