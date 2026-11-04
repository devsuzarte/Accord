# 03 — Funcionalidades e critérios de aceite

Cada item tem um ID (`F-xx`) para virar tarefa/issue (ou change do OpenSpec).

## Conta e autenticação

**F-01 Cadastro**
- Campos: nome de usuário (3–32, `[a-z0-9_.]`), e-mail, senha (≥ 8), nome de exibição.
- O primeiro cadastro de um servidor novo vira **owner**; os seguintes exigem convite válido.
- ✅ Aceite: usuário duplicado ou e-mail duplicado mostra o erro no campo; senha nunca aparece em log.

**F-02 Login e sessão persistente**
- O refresh token fica guardado com `safeStorage` do Electron (criptografado pelo SO).
- ✅ Aceite: fechar e reabrir o app mantém o login; logout revoga no servidor.

**F-03 Perfil e avatar**
- Upload png/jpg/webp ≤ 5 MB, recorte quadrado no cliente e servidor gera 128 e 256 px.
- Sem foto: avatar com iniciais e cor derivada do id.
- ✅ Aceite: trocar a foto atualiza o overlay dos outros participantes em ≤ 2 s (evento WS + metadata do LiveKit).

## Servidor, convites e canais

**F-04 Criar servidor (host mode)**: ver [arquitetura](02-arquitetura.md#host-mode-self-hosted-pelo-dono-da-sessão).
- ✅ Aceite: no Windows limpo, do clique até o servidor pronto com convite gerado em ≤ 15 s; o servidor para ao fechar o app (ou fica na bandeja, se configurado).

**F-05 Entrar por convite**
- Link `sharescreen://join?...` ou código colado manualmente.
- ✅ Aceite: convite expirado, revogado ou esgotado mostra mensagem clara.

**F-06 Gerenciar canais** (owner/admin)
- Criar, renomear, reordenar (arrastar), apagar e definir limite de pessoas.
- ✅ Aceite: a mudança aparece para todos em tempo real; apagar um canal ocupado desconecta quem está nele, com aviso.

**F-07 Lista de canais com presença**
- Aba **Canais** do painel preso ao pill: canais de voz com os participantes (avatar pequeno, nome, ícones de mudo/ensurdecido/ao vivo).
- ✅ Aceite: a lista é atualizada sem recarregar quando alguém entra, sai, muta ou começa a transmitir.

**F-08 Papéis**
- owner > admin > member. Admin gerencia canais, convites, expulsa e bane.

## Voz

**F-09 Entrar e sair de canal**
- Clique no canal (no painel) → conecta → o painel recolhe e o pill passa a mostrar os participantes.
- Trocar de canal = sair de um e entrar no outro, sem fechar o app.
- ✅ Aceite: do clique ao áudio em ≤ 2 s na LAN; som curto de entrada/saída (sons próprios, não os do Discord).

**F-10 Microfone**
- `getUserMedia` com `echoCancellation`, `noiseSuppression` e `autoGainControl` ligados por padrão (podem ser desligados nas configurações).
- Mutar, ensurdecer (ensurdecer também muta) e push-to-talk.
- ✅ Aceite: o estado de mudo aparece para os outros em ≤ 500 ms; o atalho global funciona com outro app em foco.

**F-11 Indicador de fala**
- Anel verde no avatar enquanto `participant.isSpeaking`, no overlay e na lista de canais.

**F-12 Volume por usuário**
- Clique direito no participante → slider de 0–200% (só local) e opção de mutar localmente. Salvo por `user.id`.

**F-13 Dispositivos**
- Escolher entrada/saída, com teste de microfone (medidor de nível) e de saída (som de teste).
- Troca de dispositivo durante a chamada sem reconectar.

**F-14 Reconexão**
- Perda de rede → LiveKit tenta reconectar; o overlay mostra "Reconectando…" (amarelo).
- ✅ Aceite: queda de até 10 s se recupera sem ação do usuário.

## Overlay

**F-15 Janela overlay (pill)**: detalhes técnicos em [09-estudo-overlay-opencluely](09-estudo-overlay-opencluely.md#3-arquitetura-do-overlay-no-sharescreen)
- Transparente, sem moldura, do **tamanho exato do conteúdo**, sempre no topo (`screen-saver`), fora da barra de tarefas, **não focável** e **excluída da captura** (`setContentProtection(true)`).
- Modo fantasma opcional (click-through total) por atalho.
- ✅ Aceite: clicar no pill durante um jogo em janela sem bordas não tira o foco do jogo; fora do pill, nada fica bloqueado; o pill não aparece na própria transmissão.

**F-16 Estados do overlay** (detalhes visuais em [04-design-system](04-design-system.md))
1. **Recolhido:** só uma "alça" (puxador) com a contagem de pessoas e um pulso verde se alguém está falando.
2. **Compacto (padrão):** pílula vertical de participantes, cada um com avatar + nome.
3. **Expandido:** compacto + barra de controles (mic, deafen, compartilhar, sair, engrenagem).
- Clique no grupo de participantes → expande. Clique fora ou `Esc` → volta para compacto. Atalho global → alterna oculto/visível.

**F-17 Posição e aparência**
- Arrastar pela alça; encaixe nas bordas e cantos da tela; lembra posição por monitor.
- Configurações: opacidade (40–100%), tamanho (P/M/G), mostrar nomes (sim/não), máximo de pessoas visíveis (depois disso, "+N").
- **[Hipótese]** Esmaecer automaticamente depois de X s sem ninguém falar.

**F-18 Notificações no overlay**
- Toast curto e discreto: "Fulano entrou", "Ciclano começou a transmitir", "Você está mudo" (ao falar mutado, se o nível de áudio passar do limite).

## Compartilhamento de tela

**F-19 Seletor de fonte**
- Modal próprio com duas abas: **Telas** e **Aplicativos**, com miniatura, ícone e título. Guias de navegador não aparecem (a API nem as oferece).
- Filtra a própria janela do app e o overlay.
- Opções: qualidade (preset), "Incluir áudio" (ligado por padrão).
- ✅ Aceite: no máximo 3 cliques de "Compartilhar" até estar transmitindo.

**F-20 Áudio da transmissão**
- Tela inteira → áudio do sistema **excluindo o próprio app** (sem eco das vozes).
- Janela → áudio **somente daquele processo** (e filhos).
- ✅ Aceite: com música tocando num app e um vídeo em outro, compartilhar a janela A transmite só o som de A; as vozes da chamada nunca voltam para os espectadores.

**F-21 Durante a transmissão**
- Indicador "AO VIVO" vermelho no próprio avatar; botão "Parar"; trocar de fonte sem parar.
- Se a janela compartilhada for fechada, a transmissão para sozinha, com aviso.

**F-22 Assistir transmissão**
- Selo "AO VIVO" no participante → clique → abre o viewer (janela normal: redimensionável, tela cheia com `F11`/duplo clique, volume próprio da transmissão, botão de sair).
- Mostra o nome de quem transmite e a contagem de espectadores (pós-MVP: lista de espectadores).
- ✅ Aceite: quem não abriu o viewer **não** recebe o vídeo (economia de banda).

## Configurações e sistema

**F-23 Configurações:** conta, voz (dispositivos, PTT, processamento), atalhos, overlay, transmissão (qualidade padrão), servidor (host), "Iniciar com o Windows".
**F-24 Bandeja:** ícone muda com o estado (desconectado / em chamada / mudo / ao vivo).
**F-25 Instalador e atualização:** NSIS via `electron-builder`; auto-update (`electron-updater`) com releases no GitHub.
**F-26 Logs:** arquivo rotativo em `%APPDATA%/Accord/logs` e "Copiar diagnóstico" para relatar erros.
