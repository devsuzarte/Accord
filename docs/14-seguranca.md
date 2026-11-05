# 14 — Segurança: o que alguém consegue fazer contra os outros

Revisão de 05/11/2026 (versão 0.4.0). O Accord não tem servidor central: quem hospeda abre uma
API (porta 7870) e o LiveKit (7880) no próprio PC, e os amigos entram pela rede, Radmin ou
Tailscale. Esta página lista quem poderia atacar quem, o que foi corrigido e o que continua
sendo risco.

## Quem pode atacar

1. **Alguém na mesma rede ou VPN, sem a senha** (república, LAN house, uma rede Radmin aberta).
2. **Alguém dentro da call** (tem a senha ou um convite) que resolve atrapalhar.
3. **Um site aberto no navegador de quem hospeda.** O navegador também alcança `127.0.0.1:7870`.
4. **Quem recebeu um link de convite vazado** (print, grupo errado).
5. **Quem hospeda.** Quando você entra no servidor de alguém, essa pessoa vê o que passa por ele.

## O que estava aberto e foi corrigido na 0.4.0

| Risco | Como era | Como ficou |
|---|---|---|
| Se passar pelo dono | O token deixava o próprio app mudar os atributos da chamada (`canUpdateOwnMetadata`). Qualquer um podia se marcar com a coroa de dono, mudar o nome para o de outra pessoa ou anunciar outro IP para a migração | O token não deixa mais. Nome, foto, "ensurdecido" e endereços passam por `POST /me`, que confere tudo no servidor |
| Nome igual ao de outra pessoa | Dava para entrar como "Ana" com a Ana na call | Nome repetido vindo de outro PC é recusado (`name-taken`). Do mesmo PC vale (é a pessoa voltando) |
| Assistir escondido | Quem tinha a senha pedia um token "só assistir", que é invisível na lista, e via as transmissões sem aparecer | O token de assistir só sai para quem está na call (manda o próprio token) e leva o nome dela |
| Site virando dono | Pedido de `127.0.0.1` virava dono e podia trocar a senha. Um site no navegador de quem hospeda podia entrar como dono, desconectar gente e tirar a senha | O app abre o servidor com uma chave aleatória (`SHARESCREEN_HOST_KEY`) e só os pedidos do próprio app levam essa chave. Sem ela, nada de dono, de trocar senha ou de encerrar a sessão |
| DNS rebinding | Um site fazia o próprio domínio apontar para 127.0.0.1 | Pedido do próprio PC com nome de domínio no `Host` é recusado (só IP, `localhost`, `.local` e `*.ts.net`) |
| Adivinhar a senha | Tentativas sem limite | 8 senhas erradas em 5 minutos travam aquele IP. `/join` também tem limite por minuto |
| Senha em texto | A senha ficava em texto na memória do servidor, no disco de quem guarda a cópia da sessão e dentro do link de convite | O servidor guarda só o hash (scrypt). A cópia da sessão leva o hash. O convite leva uma **chave de convite**, nunca a senha |
| Convite vazado | O link tinha a senha: só trocando a senha | **Gerar link novo** (aba Hospedar) invalida os convites antigos sem mexer em quem está na call. Trocar a senha também gera chave nova |
| "Desconectar" sem efeito | A pessoa entrava de novo na hora e o token antigo ainda lia o chat por 6 horas | Desconectar revoga o token na API, derruba as conexões de assistir da pessoa e bloqueia o IP por 15 minutos (nunca o do próprio PC do servidor) |
| Vírus pelo chat | Qualquer arquivo ia | Programas e scripts (`.exe`, `.bat`, `.ps1`, `.lnk`, `.msi`, `.js`, `.vbs`, `.scr`, `.iso` e outros) são recusados no app e no servidor |
| Encher o chat ou o disco | Sem limite de frequência; fotos de perfil ficavam para sempre no disco de quem hospeda | Limites por pessoa (8 mensagens a cada 10 s, 12 anexos por minuto, 3 marcadores por segundo). Fotos agora ficam na pasta da sessão, com teto de 150 MB, e somem no fim |
| Migração para qualquer IP | A fila da migração seguia o endereço que cada um anunciava | Só endereços de rede de casa ou VPN (10.x, 172.16–31.x, 192.168.x, 100.64–127.x, 26.x, 25.x), e o servidor novo precisa ser **da mesma sessão** (`session` em `/info`) |
| Quem está na call sem a senha | `/info` mostrava nome e foto de todos para qualquer um na rede | Em canal com senha, `/info` mostra só quantas pessoas estão lá |
| Mensagens falsas na sala | Participantes podiam publicar dados na sala | Ninguém publica dados (`canPublishData: false`). Chat, avisos da sessão e marcadores só valem vindos do servidor |
| Sobras no disco | A cópia da sessão podia ficar se o app fechasse no meio da call | É apagada ao abrir o app |
| Permissões do navegador | Qualquer página carregada numa janela ganhava microfone e tela | Só as páginas do próprio app, e só as permissões que ele usa (`windows/permissions.ts`) |

Testado com três instâncias (ver docs/10, M11): sem senha → 401; do próprio PC sem a chave do
app → papel de membro; trocar senha sem a chave → 403; `Host: evil.com` → 403; assistir sem
token → 401; `.exe` → 415; convite com chave certa → 200, errada → 401; nome repetido de outro
IP → 409; senha chutada → 429 depois de 8 tentativas; desconectado → token antigo 401 e entrar
de novo 403.

## O que continua sendo risco

- **A API e a conexão de voz não usam criptografia própria (HTTP e `ws://`).** A voz e a tela
  em si vão criptografadas (o WebRTC sempre usa DTLS-SRTP). Mas a senha no `/join`, os tokens,
  o chat e os anexos passam em texto. No **Tailscale** o túnel é criptografado (WireGuard). No
  **Radmin VPN** [Hipótese] o túnel também é, segundo o fabricante. **Numa rede local
  compartilhada** (república, LAN house, Wi-Fi público), alguém capturando o tráfego lê o chat e
  pega a senha. Próximo passo possível, grátis: o host gera um certificado próprio e o convite
  leva a impressão digital dele (o app confere).
- **Quem hospeda vê tudo o que passa pelo servidor**: o IP de cada um, o chat, os anexos, quem
  está transmitindo. Pode gravar. É o preço de não ter servidor central: entre só em servidor
  de quem você confia.
- **Seu IP fica visível para quem está na call** (o endereço de rede ou VPN, para a migração), e
  para quem hospeda.
- **Arquivos que não são programas também podem ser perigosos**: documentos do Office com
  macros, PDFs, `.zip` com coisa dentro. O bloqueio pega só o que roda direto.
- **Links no chat** abrem no navegador. Golpe por link continua possível.
- **Os anexos ficam acessíveis pelo endereço** `/chat/files/<id>` durante a sessão, sem token. O
  id é aleatório e longo (144 bits): só quem viu a mensagem sabe. Somem quando a sessão acaba.
- **Desconectar bloqueia o IP, não a pessoa.** Atrás do mesmo IP (CGNAT, mesma casa) outras
  pessoas também ficam 15 minutos fora. Com outro IP, a pessoa volta.
- **Servidor aberto por fora do app** (`accord-server.exe` à mão): sem a chave do app, vale o
  critério antigo (dono = pedido do próprio PC).
- **Atalhos globais** são lidos com `GetAsyncKeyState`, que vê o teclado do Windows inteiro. O
  app só compara com as teclas escolhidas e não guarda nem envia nada.

## Onde está no código

- API: `apps/api/src/services/security.ts` (limites, banimento, chave do app, `Host`),
  `services/auth.ts` (token), `routes/me.ts`, `routes/pointer.ts`, `services/session.ts`
  (hash da senha, chave de convite).
- App: `main/network/host-service.ts` (chave do app, encerrar/passar), `main/windows/permissions.ts`,
  `renderer/pill/call/callStore.ts` (`updateMe`, avisos da sessão), `pill/call/migration.ts`.
