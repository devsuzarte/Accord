# 12 — Publicar uma versão (e a atualização automática)

O app instalado procura versão nova sozinho (ao abrir e a cada 6 horas) na página
**Releases** do repositório `devsuzarte/Accord`. Ele baixa em segundo plano, avisa com uma
notificação e instala quando a pessoa sai do app — ou na hora, em **Você → Atualizações →
Reiniciar e atualizar** (ou pela bandeja).

> **[Verificado]** É o `electron-updater` (electron-builder) com `publish: github`. Ele lê o
> `latest.yml` da release **mais nova que não seja rascunho nem pré-lançamento**
> (`releaseType: release`) e baixa só a diferença do instalador, pelo `.blockmap`.
> O repositório precisa ser **público** para o app conseguir ler as releases sem senha.

## Passo a passo (automático, pelo GitHub Actions)

1. Aumente a versão nos três `package.json` (raiz, `apps/desktop`, `apps/api`), por exemplo `0.3.0` → `0.3.1`.
   O app só atualiza se a versão da release for **maior** que a instalada.
2. Faça o commit e crie a tag com a **mesma** versão, com `v` na frente:
   ```bash
   git commit -am "0.3.1"
   git tag v0.3.1
   git push && git push --tags
   ```
3. O workflow **Release** (`.github/workflows/release.yml`) roda num Windows do GitHub: baixa o
   LiveKit oficial (conferindo o SHA-256), gera o instalador e cria a release `Accord 0.3.1` com
   os três arquivos (`Accord-Setup-0.3.1.exe`, `.blockmap` e `latest.yml`) e as notas geradas
   pelos commits. Acompanhe em **Actions**; leva uns 10 minutos.
4. Pronto: em até 6 horas (ou ao abrirem o app) todos recebem a versão nova.

Se a tag não bater com a versão do `apps/desktop/package.json`, o workflow para com erro antes
de gastar tempo no build. Uma tag com hífen (`v0.3.1-teste`) vira **pré-lançamento**: só quem
baixar à mão recebe.

> **[Verificado]** GitHub Actions é grátis sem limite de minutos em repositório **público**
> (em privado, o plano grátis tem uma cota mensal e o Windows conta em dobro).

Também dá para rodar o workflow à mão (**Actions → Release → Run workflow**): ele só gera o
instalador e deixa como artefato para baixar, sem publicar release.

## Passo a passo (à mão, se precisar)

1. Aumente a versão nos três `package.json`.
2. Gere tudo no Windows (ou no Linux com wine, ver `CLAUDE.md`): `bun run package`.
3. No GitHub: **Releases → Draft a new release**, tag `v0.3.1`, anexe os **três** arquivos de
   `release/app/` (`.exe`, `.exe.blockmap`, `latest.yml`) e publique sem marcar pré-lançamento.

Sem o `latest.yml` a release não serve para a atualização automática (o instalador ainda pode
ser baixado à mão).

## O que dá errado com mais frequência

| Sintoma | Causa |
|---|---|
| "Não consegui procurar atualização agora" | Repositório privado, release marcada como pré-lançamento, ou faltou o `latest.yml` |
| Nunca encontra a versão nova | A versão do `package.json` não é maior que a instalada, ou a tag não bate com a versão |
| O Windows avisa "O Windows protegeu o computador" | O instalador não é assinado. Assinar exige um certificado de assinatura de código (pago); até lá, "Mais informações → Executar assim mesmo" |

## Versão de testes (pré-lançamento)

Releases marcadas como **pre-release** não chegam para ninguém pela atualização automática.
Use isso para mandar uma versão de teste a alguns amigos antes de liberar para todos.
