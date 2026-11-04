# 04 — Design system e overlay

## Diretriz

Visual **escuro, denso e arredondado, no estilo do Discord**: fundos cinza-azulados em camadas, um acento azul-violeta, verde para "falando/online" e vermelho para "mudo/ao vivo/perigo".

**Limites (para não virar cópia):** sem o nome, o logo ou o mascote do Discord, sem a fonte proprietária (gg sans) e sem os ícones dele. Os sons de entrada e saída também são próprios. O app tem nome e ícone próprios.

> **Fonte da verdade dos valores:** `packages/ui/src/styles/tokens.css`. Os blocos abaixo são a referência original; o código evoluiu (fonte Figtree, material do overlay, `--frame-pad`).

## Tokens de cor (tema escuro)

> **Valores de referência** para um tema escuro estilo Discord, para ajustar à vontade. Tudo em CSS custom properties em `packages/ui/tokens.css`, então trocar a paleta inteira é mexer num arquivo só.

```css
:root {
  /* Superfícies (da mais funda para a mais clara) */
  --bg-floating:   #111214;  /* tooltips, menus, overlay */
  --bg-tertiary:   #1E1F22;  /* barra de servidores / fundo da janela */
  --bg-secondary:  #2B2D31;  /* barra lateral de canais */
  --bg-primary:    #313338;  /* área de conteúdo */
  --bg-modifier-hover:    rgba(78, 80, 88, 0.30);
  --bg-modifier-selected: rgba(78, 80, 88, 0.60);

  /* Texto */
  --text-strong:   #F2F3F5;
  --text-normal:   #DBDEE1;
  --text-muted:    #949BA4;
  --interactive:        #B5BAC1;
  --interactive-hover:  #DBDEE1;

  /* Marca e status */
  --brand:         #5865F2;
  --brand-hover:   #4752C4;
  --status-green:  #23A55A;  /* falando / online / conectado */
  --status-yellow: #F0B232;  /* reconectando / ausente */
  --status-red:    #F23F43;  /* mudo / ao vivo / perigo */

  /* Overlay */
  --overlay-bg:    rgba(17, 18, 20, 0.82);
  --overlay-blur:  12px;

  /* Forma */
  --radius-sm: 4px;  --radius-md: 8px;  --radius-lg: 16px;  --radius-pill: 999px;
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-6: 24px;

  /* Tipografia */
  --font-sans: "Noto Sans", "Segoe UI", system-ui, sans-serif;
  --font-size-xs: 12px; --font-size-sm: 14px; --font-size-md: 16px; --font-size-lg: 20px;

  /* Movimento */
  --ease-out: cubic-bezier(0.2, 0.8, 0.2, 1);
  --dur-fast: 120ms; --dur-normal: 200ms;
}
```

Fonte: **Figtree** variável (SIL OFL), incluída no app, sem depender de rede. Geométrica e amigável como a do Discord, e legível em 12–14 px.

**Acessibilidade:** texto normal ≥ 4.5:1 sobre o fundo. Status nunca só por cor: mudo também tem ícone, e falando também tem anel.

## Ícones

**[Decisão] Lucide** (licença ISC): traço arredondado, combina com o estilo. Tamanho 20 px nos controles e 14 px nos selos.

| Ação | Ícone Lucide |
|---|---|
| Microfone ligado / mudo | `mic` / `mic-off` |
| Ensurdecer | `headphones` / `headphone-off` |
| Compartilhar tela | `monitor-up` |
| Parar transmissão | `monitor-x` |
| Sair da chamada | `phone-off` |
| Configurações | `settings` |
| Recolher / expandir | `chevrons-left` / `chevrons-right` |
| Arrastar | `grip-vertical` |
| Canal de voz | `volume-2` |
| Assistir | `eye` |

## Componentes base (`packages/ui`)

`Avatar` (tamanhos 20/24/32/40/80, com anel de fala, selo de status, fallback com iniciais) · `UserPill` · `IconButton` (variações default/active/danger e tooltip) · `Tooltip` · `ContextMenu` · `Modal` · `Tabs` · `Slider` · `Toggle` · `Select` · `Toast` · `ChannelItem` · `SourceCard` (seletor de tela).

Estados obrigatórios em todo componente interativo: default, hover, active/pressed, focus-visible (anel `--brand`), disabled.

## Overlay — anatomia

```
 COMPACTO (padrão)                 EXPANDIDO (após clique)            RECOLHIDO

 ┌──────────────────────────┐     ┌──────────────────────────┐      ┌───┐
 │ ⋮ (◉ Ana      [AO VIVO]) │     │ ⋮ (◉ Ana      [AO VIVO]) │      │ ⋮ │
 │   (◉ Bruno       [mudo]) │     │   (◉ Bruno       [mudo]) │      │ 3 │ ← contagem
 │   (◎ Você              ) │     │   (◎ Você              ) │      │ ● │ ← pulso verde se
 │    +2                    │     │    +2                    │      └───┘   alguém fala
 └──────────────────────────┘     ├──────────────────────────┤
                                  │  mic  fone  tela  sair  ⚙ │ ← barra de controles
                                  └──────────────────────────┘
  ( … ) = pill arredondada por usuário
  ◉ = avatar 32 px     ◎ = avatar com anel verde (falando)     ⋮ = alça para arrastar
```

**Medidas (tamanho M) [Decisão]**
- Pill de usuário: altura 40 px, `--radius-pill`, padding 4 px 12 px 4 px 4 px, avatar 32 px, nome 14 px semibold com `text-overflow: ellipsis` a partir de 140 px.
- Espaço entre pills: 4 px. Container com `--overlay-bg` + `backdrop-filter: blur(var(--overlay-blur))` (validar suporte em janela transparente no Spike 1), `--radius-lg` e sombra suave.
- Barra de controles: botões redondos de 36 px; o ativo/perigo usa `--status-red` de fundo (mudo, sair).
- Modo "sem nomes": só os avatares, empilhados na vertical como pílula estreita, com o nome no hover.

**Comportamento**
- Entra com fade e slide de 8 px (`--dur-normal`); a expansão anima a altura.
- A área transparente fora do container é click-through.
- Hover num participante mostra tooltip (nome + @usuario); clique direito abre o menu (volume, mutar localmente, assistir transmissão).
- Selo "AO VIVO" é clicável e abre o viewer.

## Painel preso ao pill (substitui a janela principal)

> A janela de 3 colunas no estilo Discord foi **descartada**: deixava o app com cara de genérico. O app é overlay-first. Princípios e regras em [09-estudo-overlay-opencluely](09-estudo-overlay-opencluely.md#4-direção-de-design-substitui-a-janela-genérica).

```
 ┌──────────────────────────────┐
 │ ⋮ (◉ Ana) (◉ Bruno) (◎ Você)  │  ← pill
 └──────────────────────────────┘
 ┌──────────────────────────────┐  ← painel: mesmo material, borda e raio do pill
 │  Canais   Controles   Você    │     abas compactas (texto 12–14 px)
 │ ──────────────────────────── │
 │  🔊 Geral         ◉◉ 2        │  ← canal atual destacado
 │  🔊 Jogos         ◉ 1         │
 │  🔊 Estudo                    │
 │ ──────────────────────────── │
 │  + Convidar                   │
 └──────────────────────────────┘
   largura 280–320 px · altura pelo conteúdo · abre do lado com espaço
```

Abas do painel: **Canais** (lista, entrar/sair, convidar), **Overlay** (modo fantasma, posição na tela, atalhos), **Você** (perfil, dispositivos, versão, sair do app). Os controles de chamada (mic, ensurdecer, compartilhar, sair) ficam no próprio pill, no estado expandido. Na primeira execução, o painel aparece centralizado com login/cadastro/convite.

## Seletor de tela

Modal 720×520, abas **Telas | Aplicativos**, grade de `SourceCard` (miniatura 16:9, ícone do app e título truncado), rodapé com Qualidade (select), "Incluir áudio" (toggle) e os botões Cancelar / **Transmitir** (`--brand`).
