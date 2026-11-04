# 12 — Publicar uma versão (e a atualização automática)

O app instalado procura versão nova sozinho (ao abrir e a cada 6 horas) na página
**Releases** do repositório `devsuzarte/Accord`. Ele baixa em segundo plano, avisa com uma
notificação e instala quando a pessoa sai do app — ou na hora, em **Você → Atualizações →
Reiniciar e atualizar** (ou pela bandeja).

> **[Verificado]** É o `electron-updater` (electron-builder) com `publish: github`. Ele lê o
> `latest.yml` da release **mais nova que não seja rascunho nem pré-lançamento**
> (`releaseType: release`) e baixa só a diferença do instalador, pelo `.blockmap`.
> O repositório precisa ser **público** para o app conseguir ler as releases sem senha.

## Passo a passo

1. Aumente a versão nos três `package.json` (raiz, `apps/desktop`, `apps/api`), por exemplo `0.2.0` → `0.2.1`.
   O app só atualiza se a versão da release for **maior** que a instalada.
2. Gere tudo no Windows (ou no Linux com wine, ver `CLAUDE.md`):
   ```powershell
   bun run package
   ```
3. No GitHub: **Releases → Draft a new release**.
   - Tag: `v0.2.1` (mesma versão, com `v` na frente) → **Create new tag**.
   - Anexe os **três** arquivos de `release/app/`:
     - `Accord-Setup-0.2.1.exe`
     - `Accord-Setup-0.2.1.exe.blockmap`
     - `latest.yml`
   - Deixe **desmarcado** "Set as a pre-release" e publique (**Publish release**).
4. Pronto: em até 6 horas (ou ao abrirem o app) todos recebem a versão nova.

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
