# 06 — Riscos e mitigações

| # | Risco | Prob. | Impacto | Mitigação | Spike |
|---|---|---|---|---|---|
| R1 | **Participantes de fora não conseguem conectar ao host** (NAT, CGNAT da operadora, firewall) | Alta | Alto | UDP mux em uma porta (7882) + fallback ICE/TCP (7881). Recomendar VPN mesh (Tailscale/ZeroTier) como caminho padrão. Assistente com teste de alcance. Atrás de CGNAT, o encaminhamento de portas não funciona, então a saída é VPN ou VPS | S4 |
| R2 | **Eco:** o áudio da tela inteira captura as vozes da chamada | Alta | Alto | Process loopback com **exclusão** da árvore de processos do próprio app | S3 |
| R3 | Addon nativo de áudio por processo atrasa ou é instável | Média | Médio | Plano B: áudio só na tela inteira (com mitigação do R2), janela sem áudio e com aviso; o addon entra numa versão seguinte | S3 |
| R4 | **Upload do host** não aguenta (o SFU roda na casa dele e cada espectador consome upload) | Média | Alto | Assinatura de tela só sob demanda, simulcast, presets moderados, limite de espectadores por transmissão; medir no S2/S4; documentar a banda necessária | S2, S4 |
| R5 | Overlay não fica por cima de jogos em **tela cheia exclusiva** | Alta | Médio | Comunicar: o suporte é a jogos em janela sem bordas. Injeção em jogo está fora do escopo (complexa e pode acionar anti-cheat) | S1 |
| R6 | Click-through com `forward: true` falha em alguns cenários (ex.: multi-monitor, DPI misto) | Média | Médio | Testar com 2 monitores e escalas diferentes; alternativa: alternar `ignoreMouseEvents` por hit-test vindo do renderer | S1 |
| R7 | Electron pesado demais para o "leve" esperado | Média | Médio | Orçamento medido na Fase 0, bundles enxutos, viewer sob demanda; Tauri como plano de longo prazo (UI já isolada) | S2 |
| R8 | Push-to-talk global (soltar tecla) exige hook nativo | Alta | Baixo | `uiohook-napi` ou equivalente; enquanto isso, PTT em modo alternar | S5 |
| R9 | Conexão `ws://` sem TLS ser bloqueada (secure context / mixed content) na origem do app | Média | Médio | Servir o renderer de origem local que aceite `ws://`; ou TLS com certificado autoassinado e pinning no cliente; em nuvem, TLS real | S4 |
| R10 | Segurança do host exposto à internet | Média | Alto | Chaves geradas por instalação (nunca `devkey/secret`), cadastro só com convite, rate limit, atualizações; recomendar VPN mesh | — |
| R11 | Chromium/Windows mudam o comportamento da captura (ex.: o macOS mudou o padrão para CoreAudio Tap no Electron 39) | Média | Médio | Fixar a versão do Electron, testar a captura antes de cada atualização, ler as notas de versão | — |
| R12 | Semelhança visual demais com o Discord (marca) | Baixa | Médio | Nome, logo, fonte, ícones e sons próprios; só a linguagem visual é inspirada | — |
| R14 | `setIgnoreMouseEvents(..., { forward: true })` para de funcionar quando o app em foco roda como administrador (comum em jogos) | Média | Médio | Não depender de hover para trocar o modo de clique: o pill é do tamanho do conteúdo (sempre clicável) e o modo fantasma é por atalho | S1 |
| R15 | Overlay rouba o foco do jogo ao ser clicado | Média | Alto | Pill com `focusable:false` + `showInactive()`; só o painel (com campos de texto) recebe foco | S1 |
| R13 | SmartScreen do Windows assusta o usuário (instalador sem assinatura) | Alta | Baixo | Instruções na página de download; assinatura de código quando houver distribuição maior | — |

## Requisitos de sistema do MVP

- Windows 10 versão **2004 ou superior** (exclusão do overlay da captura e process loopback dependem disso) ou Windows 11
- Host: conexão com upload suficiente para N espectadores × bitrate do preset (definir a tabela depois do S2)
