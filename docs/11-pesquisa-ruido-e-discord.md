# 11 — Pesquisa: supressão de ruído e login com Discord

Pesquisado em 04/11/2026. Legenda: **[Verificado]** = confirmado na fonte citada · **[Hipótese]** = provável, validar num teste antes de virar código.

---

## 1. Supressão de ruído

### O que o app já usa hoje
O microfone já é capturado com `noiseSuppression`, `echoCancellation` e `autoGainControl` ligados: é o processamento nativo do WebRTC/Chromium. **[Verificado]** A documentação do LiveKit recomenda deixar esses ajustes ligados quando não se usa um cancelamento de ruído "avançado". Ele tira chiado constante, mas deixa passar teclado mecânico, ventilador forte e barulho de rua.

### Opções avaliadas

| Opção | Como funciona | Licença | Funciona com o nosso servidor self-hosted? | Custo de CPU | Qualidade |
|---|---|---|---|---|---|
| **WebRTC nativo** (atual) | Filtro clássico dentro do Chromium | — | Sim | Muito baixo | Básica |
| **Noise gate** | Corta o som abaixo de um volume | MIT (`@sapphi-red/web-noise-suppressor`) | Sim | Desprezível | Só silencia entre falas |
| **Speex** (preprocess) | DSP clássico em WASM | MIT (mesmo pacote) | Sim | Baixo | Um pouco melhor que o nativo |
| **RNNoise** | Rede neural pequena (Xiph), em WASM num AudioWorklet | MIT (`@sapphi-red/web-noise-suppressor` 0.4.1) | Sim, roda no PC de quem fala | Baixo/médio | Boa para teclado e ventilador |
| **DeepFilterNet3** | Modelo de IA maior, em WASM + ONNX | Apache-2.0 ou MIT (`deepfilternet3-noise-filter` 1.3.0) | Sim | **Mais alto** (o README não dá números) | A melhor entre as abertas |
| **Krisp** (`@livekit/krisp-noise-filter`) | Modelo comercial da Krisp no cliente | Termos do LiveKit | **Não serve para nós.** A documentação apresenta o Krisp como recurso "para clientes do LiveKit Cloud" | Médio | Muito boa |
| **ai-coustics** | Processa no servidor (agentes) | Pago | Só nos SDKs de agentes (Python/Node), não em clientes de chamada | — | — |
| **NVIDIA Broadcast / Windows Studio Effects** | Fica no sistema, fora do app | Do fabricante | Sim (o app nem fica sabendo) | Na GPU/NPU | Muito boa |

**O que confirmei nas fontes:**
- **[Verificado]** O `@sapphi-red/web-noise-suppressor` traz três nós de AudioWorklet: noise gate, RNNoise (baseado no xiph/rnnoise) e Speex (preprocess do speexdsp). Tem exemplo de configuração com Vite (`?url`). Licença MIT, versão 0.4.1.
- **[Verificado]** O `deepfilternet3-noise-filter` se integra ao LiveKit com `audioTrack.setProcessor(filter)`, ajusta a intensidade com `setSuppressionLevel()`, liga e desliga com `setEnabled()`, e os exemplos usam 48 kHz. O README não informa o tamanho do modelo nem o custo de CPU.
- **[Verificado]** O Krisp do LiveKit é apresentado como recurso "for your LiveKit Cloud project". A página não fala de servidores self-hosted.

### Recomendação
Uma opção **"Supressão de ruído"** na seção Áudio do painel, com três níveis:
1. **Padrão**: o filtro nativo, como hoje;
2. **Forte (RNNoise)**: o novo padrão sugerido, porque é leve, MIT e roda no PC de quem fala, sem depender do servidor;
3. **Máxima (DeepFilterNet3)**: só depois de medir a CPU no Windows. Se pesar, fica como opção "para PCs mais fortes".

**Cuidados na implementação:**
- **[Hipótese]** Com RNNoise ligado, convém **desligar o `noiseSuppression` nativo** para não filtrar duas vezes, mas manter o `echoCancellation` ligado.
- O arquivo `.wasm` e o worklet precisam ser arquivos de verdade (`?url&no-inline`), pela mesma regra de segurança (CSP) que já tratamos no som da transmissão.

> **[Decisão] 04/11/2026 — implementado:** RNNoise é o padrão, com um interruptor "Supressão de ruído" na seção Áudio (desligado = só o filtro do Chromium). Com ele ligado, o `noiseSuppression` nativo fica desligado e o `echoCancellation` continua. A página do pill ganhou `'wasm-unsafe-eval'` na CSP (sem isso o WebAssembly não compila). DeepFilterNet3 continua em aberto até medir a CPU no Windows. Código: `apps/desktop/src/renderer/pill/call/noise.ts`.
>
> **[Decisão] 04/11/2026:** login com Discord **fica para depois**. Nome e foto agora são escolhidos na aba Você.

---

## 2. Login com Discord (nome e foto do usuário)

### É possível?
**Sim.** O Discord tem OAuth2, e o escopo `identify` dá acesso ao usuário logado. A questão é **como fazer isso num app desktop sem guardar segredo**.

**[Verificado]** na documentação de OAuth2 do Discord:
- URL de autorização: `https://discord.com/oauth2/authorize`; URL de token: `https://discord.com/api/oauth2/token` (aceita só `application/x-www-form-urlencoded`).
- `identify` permite chamar `/users/@me` (sem o e-mail).
- O fluxo padrão de troca do código exige `client_id` **e** `client_secret`. Num app instalado não dá para esconder o segredo, então esse fluxo serve só com um servidor nosso guardando o segredo.
- O token de acesso dura 7 dias (604800 s no exemplo) e pode ser renovado com `grant_type=refresh_token`.
- Existe o fluxo **implícito**, que não devolve token de renovação: a pessoa precisa autorizar de novo quando o token expira.

**[Verificado]** no guia de vinculação de conta do Discord Social SDK:
- Com **"Public Client"** ligado no app (Developer Portal), a troca do código por token é feita com **code challenge + code verifier** (é o PKCE, embora o guia não use o nome), **sem client secret**.
- O próprio guia avisa: *"Most games will not want to ship with this enabled"*, ou seja, a maioria dos jogos não deveria publicar com isso ligado.
- Os exemplos são do SDK em C++. Há também URIs de retorno para desktop e mobile.

### Caminhos possíveis

| Caminho | Como | Prós | Contras |
|---|---|---|---|
| **A. Public Client + PKCE** (recomendado) | O app abre o login do Discord no navegador, recebe o código num endereço local (`http://127.0.0.1:<porta>/callback`) e troca por token com o `code_verifier` | Sem segredo no app; tem token de renovação | O Discord desaconselha Public Client para a maioria dos casos. **[Hipótese]** Confirmar num teste se a troca por HTTP puro (sem o SDK) aceita PKCE e se o endereço local é aceito como retorno |
| **B. Fluxo implícito** | O token volta direto no endereço de retorno | Simples, sem segredo | Sem renovação: reautoriza a cada 7 dias. Fluxo considerado menos seguro |
| **C. Servidor central nosso** | Um serviço pequeno na nuvem guarda o `client_secret` e faz a troca | Fluxo oficial completo | Precisa de um servidor público (o projeto hoje é self-hosted em cada host) |

### Como ficaria no sharescreen
1. Botão **"Entrar com Discord"** na aba Canais, ao lado do campo de nome, que continua existindo para quem não quer vincular.
2. Depois do login, o app lê `/users/@me` e usa:
   - **nome:** `global_name` (o nome de exibição), ou `username` se não houver;
   - **foto:** `https://cdn.discordapp.com/avatars/{id}/{avatar}.png?size=128`. **[Hipótese]** É o formato do CDN de imagens do Discord; confirmar na referência de "Image Formatting" antes de implementar.
3. Na entrada do canal, o app envia `name` e `avatarUrl`. O servidor coloca a foto nos metadados do participante no LiveKit, e o pill mostra a foto no lugar das iniciais (o componente `Avatar` já aceita `src`).
4. O token fica guardado com `safeStorage` do Electron (criptografado pelo Windows) e pode ser removido em "Você → Desvincular Discord".

### Cuidados
- **Nada de "Entrar com Discord" falso:** o login acontece no site oficial do Discord, no navegador da pessoa. Nunca pedimos a senha do Discord dentro do app.
- Pedir **só** o escopo `identify` (sem e-mail e sem servidores).
- O app continua com **nome e marca próprios**. O botão segue as diretrizes de marca do Discord.
- Precisa criar um app no Discord Developer Portal (gratuito) para ter o `client_id` e cadastrar o endereço de retorno.

---

## Fontes
- [LiveKit: Noise cancellation](https://docs.livekit.io/home/client/tracks/noise-cancellation)
- [LiveKit: Enhanced noise cancellation with Krisp](https://docs.livekit.io/guides/enhanced-noise-cancellation/)
- [npm: @sapphi-red/web-noise-suppressor](https://www.npmjs.com/package/@sapphi-red/web-noise-suppressor)
- [npm: deepfilternet3-noise-filter (README)](https://cdn.jsdelivr.net/npm/deepfilternet3-noise-filter@1.3.0/README.md)
- [npm: @livekit/krisp-noise-filter](https://www.npmjs.com/package/@livekit/krisp-noise-filter)
- [Discord: OAuth2](https://docs.discord.com/developers/topics/oauth2)
- [Discord Social SDK: Account Linking with Discord](https://docs.discord.com/developers/discord-social-sdk/development-guides/account-linking-with-discord)
- [Discord Social SDK: Public Client](https://docs.discord.com/developers/discord-social-sdk/development-guides/provisional-accounts/public-client)
