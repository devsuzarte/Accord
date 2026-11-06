# Como contribuir com o Accord

Obrigado por querer ajudar. O Accord é mantido por Benjamin Suzarte
([devsuzarte](https://github.com/devsuzarte)), que revisa e decide o que entra. Este guia diz
como propor uma mudança e o que esperar da revisão.

_English: contributions are welcome in English or Portuguese. Open an issue first for anything
bigger than a small fix, then send a pull request against `main`. The maintainer reviews every
PR and merges it, asks for changes, or closes it with a reason._

## Antes de começar

- **Correção pequena** (texto, bug óbvio, tradução): pode mandar o pull request direto.
- **Algo maior** (feature nova, mudança de comportamento, dependência nova, mudança de
  arquitetura): abra uma **issue** antes e espere um "pode seguir". Isso evita você gastar tempo
  num caminho que não vai ser aceito.
- **Falha de segurança**: nunca em issue ou PR público. Veja o [SECURITY.md](SECURITY.md).
- Procure issues marcadas com `bom primeiro passo` se quiser um lugar para começar.

## Preparar o ambiente

Precisa do [Bun](https://bun.sh) 1.4.4. Para testar voz e tela, siga o "Testar chamada sozinho"
do [CLAUDE.md](CLAUDE.md) (o servidor de voz de desenvolvimento e duas instâncias do app).

```bash
bun install
bun run dev
```

## O pull request

1. Faça um fork e crie um branch a partir de `main` (`fix/microfone-some`, `feat/salas-rapidas`).
2. Uma mudança por PR. PR pequeno é revisado mais rápido.
3. Antes de enviar, rode:
   ```bash
   bun run typecheck
   bun run lint
   bun run format
   ```
   O GitHub roda as mesmas verificações (CI) e o PR só entra com elas passando.
4. Preencha o modelo do PR: o que muda, por quê, como testou e prints se mexeu na interface.
5. Se o PR resolve uma issue, escreva `Resolve #123` na descrição.

### Regras do projeto

Estão no [CLAUDE.md](CLAUDE.md) e em `docs/`. As que mais pegam:

- **Textos da interface** sempre nos dois idiomas: `packages/shared/src/i18n/pt-BR.ts` e
  `en.ts`, com as mesmas chaves. Nada de texto fixo no componente.
- **Cores** só pelos tokens (`packages/ui`) ou `color-mix`. Nada de cor fixa em hexadecimal.
- **Nunca** usar marca, ícones, fontes ou sons do Discord. Ícones são do Lucide.
- O renderer não importa nada do Electron: o acesso ao sistema passa pelo `PlatformBridge`.
- Canal IPC novo segue o caminho `shared/ipc.ts` → `PlatformBridge` → preload → `main/ipc.ts`,
  com o conteúdo validado no main.
- Mudou uma decisão? Atualize o documento em `docs/` no mesmo PR.
- Mudança em segurança (API, tokens, IPC, permissões) precisa explicar o risco no PR.

## Como a revisão funciona

Todo PR é revisado pelo mantenedor (o GitHub pede a revisão automaticamente pelo
[CODEOWNERS](.github/CODEOWNERS)). O resultado é um destes:

| Resposta | O que significa | O que você faz |
|---|---|---|
| **Aprovado** | Pode entrar como está | Nada: o mantenedor faz o merge |
| **Pede mudanças** | A ideia é boa, mas algo precisa mudar | Ajuste no mesmo branch e responda aos comentários; o PR é revisto |
| **Comentário / pergunta** | Falta entender algo antes de decidir | Responda no PR |
| **Fechado** | Não vai entrar (fora do rumo do projeto, duplicado, sem resposta) | O motivo fica escrito no PR |

- Comentário marcado **"sugestão"** ou **"opcional"** não bloqueia o merge; o resto, sim.
- PR parado por 30 dias esperando o autor pode ser fechado (dá para reabrir depois).
- O merge é feito pelo mantenedor, em geral como **squash** (um commit por PR).
- A decisão final sobre o que entra é do mantenedor. Não leve para o lado pessoal: às vezes
  uma boa ideia não cabe no momento do projeto.

## Licença das contribuições

O Accord é licenciado sob a [Apache License 2.0](LICENSE). Ao enviar um pull request, você
concorda que a sua contribuição entra sob essa mesma licença (seção 5 da Apache 2.0) e declara
que tem o direito de enviá-la: o código é seu, ou de uma fonte compatível com a Apache 2.0, com
o crédito indicado. Não envie código copiado de projetos com licença incompatível nem de
projetos fechados.

## Conduta

Todos seguem o [código de conduta](CODE_OF_CONDUCT.md).
