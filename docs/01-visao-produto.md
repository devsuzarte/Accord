# 01 — Visão do produto e escopo

## Problema

Quem joga, estuda ou trabalha junto quer conversar e mostrar a tela sem que o app de chamada atrapalhe. Uma janela grande de chamada ocupa espaço e tira o foco. A ideia é que a chamada viva num **overlay pequeno e ocultável** e que compartilhar tela (com áudio) leve dois cliques.

## Proposta de valor

- **Discreto:** um pill flutuante com os participantes; some quando não precisa.
- **Rápido:** entrar num canal → falar → compartilhar tela inteira ou um app, com áudio.
- **Seu servidor:** o dono da sessão hospeda; os dados ficam com ele. Dá para migrar para a nuvem depois.

## Personas (hipóteses, validar na [pesquisa](07-pesquisa-usuarios.md))

| Persona | Contexto | O que precisa |
|---|---|---|
| **Host (dono da sessão)** | Monta o servidor para o grupo de amigos/turma | Subir o servidor sem saber de redes, convidar pessoas, controlar quem entra |
| **Participante gamer** | Joga em tela cheia enquanto conversa | Overlay que não atrapalha, push-to-talk, compartilhar o jogo com o som |
| **Participante estudo/trabalho** | Mostra código, slides, um app | Compartilhar uma janela específica com boa nitidez, sem expor o resto da tela |

## User stories do MVP

**Conta**
- US01 — Como usuário, quero criar conta com nome de usuário, e-mail e senha.
- US02 — Como usuário, quero definir nome de exibição e foto de perfil.
- US03 — Como usuário, quero continuar logado entre aberturas do app.

**Servidor e canais**
- US04 — Como host, quero iniciar o servidor pelo próprio app e gerar um convite.
- US05 — Como participante, quero entrar no servidor por link/código de convite.
- US06 — Como host/admin, quero criar, renomear, ordenar e apagar canais de voz.
- US07 — Como usuário, quero ver quem está em cada canal antes de entrar.

**Voz**
- US08 — Como usuário, quero entrar e sair de um canal de voz com um clique.
- US09 — Como usuário, quero mutar microfone e ensurdecer (deafen), inclusive por atalho global.
- US10 — Como usuário, quero push-to-talk opcional.
- US11 — Como usuário, quero ver quem está falando (anel verde no avatar).
- US12 — Como usuário, quero ajustar o volume de cada pessoa só para mim.
- US13 — Como usuário, quero escolher os dispositivos de entrada e saída.

**Overlay**
- US14 — Como usuário, quero ver os participantes (foto + nome) num overlay em pill sempre visível.
- US15 — Como usuário, quero ocultar/recolher o overlay e reabrir por clique ou atalho.
- US16 — Como usuário, quero clicar no overlay para abrir os controles (mic, deafen, compartilhar, sair).
- US17 — Como usuário, quero arrastar o overlay e que ele lembre a posição.
- US18 — Como usuário, quero que o overlay **não apareça** na minha própria transmissão.

**Compartilhamento de tela**
- US19 — Como usuário, quero escolher entre **tela inteira** ou **um aplicativo/janela** (nunca guia de navegador).
- US20 — Como usuário, quero que o **áudio** vá junto: o do sistema (tela inteira) ou só o do app (janela).
- US21 — Como usuário, quero escolher qualidade (resolução/FPS).
- US22 — Como participante, quero ver quem está transmitindo e abrir a transmissão numa janela própria (redimensionável, tela cheia, volume da transmissão).

## Dentro do MVP

Tudo o que está nas user stories acima, em **Windows 10 2004+ / 11**, com servidor rodando na máquina do host (LAN ou acesso remoto via VPN mesh/encaminhamento de portas).

## Fora do MVP (backlog)

- Chat de texto, mensagens diretas, amizades
- Vários servidores por conta (estilo lista de servidores do Discord); no MVP, **1 instância = 1 servidor**
- Câmera/webcam
- macOS e Linux (a arquitetura já prevê; ver [riscos](06-riscos.md))
- Supressão de ruído avançada (RNNoise), sensibilidade de voz com gate
- Gravação de chamadas
- Criptografia ponta a ponta (E2EE)
- Hospedagem em nuvem gerenciada, multi-tenant
- Overlay injetado em jogos em tela cheia exclusiva (o MVP é janela "sempre no topo", que funciona com jogos em **janela sem bordas**)

## Métricas de sucesso do MVP

| Métrica | Meta inicial [Decisão] |
|---|---|
| Tempo de "abrir o app" até "falando num canal" (usuário já logado) | ≤ 10 s |
| Cliques para começar a compartilhar uma janela com áudio | ≤ 3 |
| Participantes simultâneos por canal sem degradar (host em rede doméstica) | 5 (medir) |
| Consumo de RAM com overlay ativo e em chamada | medir na Fase 0 e definir orçamento |
| Taxa de sucesso no teste de usabilidade do overlay | ≥ 80% das tarefas sem ajuda |
