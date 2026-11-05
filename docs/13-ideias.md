# 13 — Ideias para o Accord ser diferente (sem nada pago)

O Discord resolve "falar com qualquer pessoa em qualquer lugar". O Accord pode ganhar num recorte
menor e mais fiel: **um grupo pequeno de amigos que joga junto**, quer qualidade alta e não quer
depender de servidor de ninguém. As ideias abaixo puxam para esse lado. Tudo cabe sem custo:
roda no PC de quem usa, no GitHub (público) ou em APIs do próprio Windows.

Esforço: P (dias), M (uma a duas semanas), G (mais que isso).

## O que já é diferencial (e vale dizer em voz alta)

- **1080p a 60 fps de graça.** No Discord isso é pago. Aqui o limite é a internet de quem hospeda,
  não um plano. É a frase do README e da página de convite.
- **A call não tem dono.** Se o host cai, a sessão passa para o próximo da fila com o chat junto.
  É raro em apps de voz.
- **Nada fica guardado.** Chat e anexos somem quando a sessão acaba, e nada passa por um servidor
  de empresa.
- **Overlay-first.** Não é uma janela para alternar com Alt+Tab: é o pill em cima do jogo.

## Ideias que só fazem sentido num app de overlay

| Ideia | Por que diferencia | Esforço |
|---|---|---|
| ✅ (0.4.0) **Apontar na tela de quem transmite.** Quem assiste clica na transmissão e aparece um marcador (ou um rabisco que some em 3 s) no overlay de quem transmite, por cima do jogo | "Olha ali no minimapa" vira um clique. É o recurso que mais conversa com o uso real de compartilhar tela entre amigos | M |
| ✅ (0.4.0) **Transmissão em miniatura sobre o jogo.** O viewer vira uma janelinha do overlay (não focável, clique atravessa), para ver a tela do amigo enquanto você joga | Hoje, para assistir, você sai do seu jogo | M |
| **Abaixar o som do jogo quando alguém fala.** O Windows deixa controlar o volume por aplicativo (`ISimpleAudioVolume`, pelo koffi que já usamos) | O Discord tem a "atenuação", que abaixa todos os outros apps juntos; aqui pode ser só o jogo, na medida que você escolher. Diferença pequena, mas é conforto diário | M |
| ✅ (0.4.0) **Atalhos globais para mutar e push-to-talk** (hoje só existem Ctrl+Shift+O e Ctrl+Shift+G) | Básico que falta, e no overlay faz ainda mais falta | P |
| **"Está jogando…" automático.** Lê o nome do jogo em tela cheia (processo em primeiro plano) e mostra na lista de pessoas e no pill | Dá contexto sem configurar nada. Fica só na sessão, sem histórico | P |

## Qualidade e rede (aproveitando o M10)

| Ideia | Por que diferencia | Esforço |
|---|---|---|
| **Quem assiste avisa quem transmite.** Os viewers mandam o diagnóstico (já calculado no M10) pela sala; quem transmite vê "2 pessoas travando — trocar para Leve e fluido?" | Resolve a dúvida "está fluido para uns e ruim para outros" sem ninguém abrir estatística | P |
| **Teste de rede antes de hospedar.** Medir o upload até um amigo e dizer quantas pessoas cabem em cada qualidade | O host é o gargalo (o upload dele é multiplicado por quem assiste). Mostrar isso evita frustração | M |
| **Assistente de conexão** (o que sobrou do M4): checar firewall, porta e se o Radmin/Tailscale está no ar, com o que fazer em cada caso | Hoje é a parte que mais exige saber de rede | M |
| **Áudio espacial leve.** Cada voz um pouco para a esquerda ou direita (WebAudio `PannerNode`) | Com 5+ pessoas falando, fica bem mais fácil saber quem é quem | P |

## Sessão de jogo

| Ideia | Por que diferencia | Esforço |
|---|---|---|
| **Replay dos últimos 30 s.** Um atalho salva os últimos 30 s da transmissão que você assiste (ou da sua tela) e manda no chat | O lance acabou de acontecer e todo mundo quer ver de novo. O Discord tem clipes para quem grava; aqui quem **assiste** também salva. Tudo local, com `MediaRecorder` | M |
| **Salas rápidas dentro do canal.** "Time A / Time B" com um arrastar, e um botão para juntar todo mundo de volta | Em jogo com times é o que mais se faz no Discord, e aqui pode ser instantâneo | M |
| **Assistir junto.** Um vídeo do YouTube tocando sincronizado para todos (o host manda play/pause/posição pela sala) | Momento de pausa entre partidas, sem precisar transmitir a tela | M |
| **Exportar o chat no fim** (opcional, um clique antes de encerrar) | Mantém o "nada fica guardado" como padrão e ainda deixa guardar quando quiser | P |
| **Legendas e resumo da call no próprio PC** (Whisper rodando local) | Privado, sem nuvem. Útil para quem chegou atrasado. É pesado; fica para depois | G |

## Distribuição sem gastar

- **Aviso do SmartScreen:** projetos open source podem pedir assinatura de código gratuita na
  SignPath Foundation. [Hipótese] conferir os requisitos atuais antes de pedir. Enquanto isso,
  publicar também no **winget** (manifesto grátis, por pull request) dá um jeito de instalar que
  as pessoas confiam mais.
- **Página de convite = vitrine.** Quem recebe um convite e ainda não tem o app cai na página do
  GitHub Pages. Vale ela mostrar em uma linha o que o Accord é e o botão de baixar.
- **Relato de problema com diagnóstico.** Um modelo de issue no GitHub que pede o texto do
  "Copiar diagnóstico". Sem telemetria, é a forma de saber o que quebra.

## O que eu faria primeiro

1. Atalhos de mutar e push-to-talk (P): falta básica.
2. Quem assiste avisa quem transmite (P): fecha o ciclo do indicador de qualidade.
3. Apontar na tela de quem transmite (M): o recurso que ninguém tem e que mostra o porquê do overlay.
4. Transmissão em miniatura sobre o jogo (M).

## O que não dá sem pagar (por enquanto)

- **Assistir pelo navegador, sem o app:** a página do convite é HTTPS e o servidor do host é
  HTTP num IP. O navegador bloqueia essa mistura, e resolver exige certificado com domínio
  (Tailscale Funnel ou um túnel resolveriam, mas mudam o modelo "sem servidor de ninguém").
- **Amigos sem Radmin/Tailscale e sem porta aberta:** precisaria de um servidor TURN na
  internet, que tem custo de banda.
