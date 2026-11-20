import type { CustomEmoji } from '@sharescreen/shared'
import { Fragment, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Formatação das mensagens, no estilo do Discord: **negrito**, *itálico*, ~~riscado~~,
 * `código`, blocos ```código```, > citação, ||spoiler||, links, @menções e :emojis: do
 * servidor. Monta elementos do React (nada de HTML vindo de fora).
 */
export interface MarkdownContext {
  emojis: Map<string, CustomEmoji>
  serverUrl: string
  /** Seu nome (a menção a você fica destacada). */
  me: string
}

const INLINE =
  /(`[^`\n]+`)|(\*\*[^*\n]+?\*\*)|(~~[^~\n]+?~~)|(\|\|[^|\n]+?\|\|)|(\*[^*\s][^*\n]*?\*|(?<![\p{L}\p{N}])_[^_\n]+?_(?![\p{L}\p{N}]))|(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])|(:[a-z0-9_]{2,32}:)|((?<![\p{L}\p{N}_])@[\p{L}\p{N}_.-]{1,32})/gu

function Spoiler({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false)
  return (
    <span
      className="md-spoiler"
      data-shown={shown || undefined}
      role="button"
      tabIndex={0}
      onClick={() => setShown(true)}
      onKeyDown={(e) => e.key === 'Enter' && setShown(true)}
    >
      {children}
    </span>
  )
}

function inline(text: string, ctx: MarkdownContext, key = 'i'): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  for (const match of text.matchAll(INLINE)) {
    const at = match.index ?? 0
    if (at > last) out.push(text.slice(last, at))
    const [whole, code, bold, strike, spoiler, italic, link, emoji, mention] = match
    const k = `${key}-${n++}`
    if (code) out.push(<code key={k}>{code.slice(1, -1)}</code>)
    else if (bold) out.push(<strong key={k}>{inline(bold.slice(2, -2), ctx, k)}</strong>)
    else if (strike) out.push(<s key={k}>{inline(strike.slice(2, -2), ctx, k)}</s>)
    else if (spoiler) out.push(<Spoiler key={k}>{inline(spoiler.slice(2, -2), ctx, k)}</Spoiler>)
    else if (italic) out.push(<em key={k}>{inline(italic.slice(1, -1), ctx, k)}</em>)
    else if (link) {
      out.push(
        <a key={k} href={link} target="_blank" rel="noreferrer">
          {link}
        </a>,
      )
    } else if (emoji) {
      const found = ctx.emojis.get(emoji.slice(1, -1))
      out.push(
        found ? (
          <img
            key={k}
            className="md-emoji"
            src={`${ctx.serverUrl}${found.path}`}
            alt={emoji}
            title={emoji}
            draggable={false}
          />
        ) : (
          emoji
        ),
      )
    } else if (mention) {
      const me = mention.slice(1).toLowerCase() === ctx.me.toLowerCase()
      out.push(
        <span key={k} className="md-mention" data-me={me || undefined}>
          {mention}
        </span>,
      )
    } else out.push(whole)
    last = at + whole.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Linhas com `> ` viram citação; o resto, parágrafos com quebra de linha. */
function blocks(text: string, ctx: MarkdownContext, key: string): ReactNode[] {
  const lines = text.split('\n')
  const out: ReactNode[] = []
  let quote: string[] = []
  let plain: string[] = []
  const flushQuote = () => {
    if (!quote.length) return
    out.push(
      <blockquote key={`${key}-q${out.length}`}>
        {withBreaks(quote.join('\n'), ctx, key)}
      </blockquote>,
    )
    quote = []
  }
  const flushPlain = () => {
    if (!plain.length) return
    out.push(
      <Fragment key={`${key}-p${out.length}`}>{withBreaks(plain.join('\n'), ctx, key)}</Fragment>,
    )
    plain = []
  }
  for (const line of lines) {
    if (/^>\s?/.test(line)) {
      flushPlain()
      quote.push(line.replace(/^>\s?/, ''))
    } else {
      flushQuote()
      plain.push(line)
    }
  }
  flushQuote()
  flushPlain()
  return out
}

function withBreaks(text: string, ctx: MarkdownContext, key: string): ReactNode[] {
  return text.split('\n').flatMap((line, i) => {
    const parts = inline(line, ctx, `${key}-${i}`)
    return i === 0 ? parts : [<br key={`${key}-br${i}`} />, ...parts]
  })
}

export function Markdown({ text, ctx }: { text: string; ctx: MarkdownContext }) {
  const parts = text.split(/```(?:[\w+-]*\n)?([\s\S]*?)```/g)
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="md-code">
            <code>{part.replace(/\n$/, '')}</code>
          </pre>
        ) : part ? (
          <Fragment key={i}>{blocks(part, ctx, `b${i}`)}</Fragment>
        ) : null,
      )}
    </>
  )
}

/** Mensagem só com emojis (até 27): aparece grande, como no Discord. */
export function onlyEmojis(text: string, emojis: Map<string, CustomEmoji>): boolean {
  const trimmed = text.trim()
  if (!trimmed || trimmed.length > 200) return false
  let count = 0
  const rest = trimmed.replace(/:([a-z0-9_]{2,32}):/g, (whole, name: string) => {
    if (!emojis.has(name)) return whole
    count++
    return ''
  })
  const pictos = rest.match(/\p{Extended_Pictographic}|\p{Regional_Indicator}{2}/gu) ?? []
  count += pictos.length
  const leftover = rest.replace(
    /\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Emoji_Modifier}|\u200d|\ufe0f|\u20e3|\s/gu,
    '',
  )
  return leftover === '' && count > 0 && count <= 27
}

/** Você foi citado nesta mensagem (com @nome)? */
export function mentions(text: string, me: string): boolean {
  if (!me) return false
  const escaped = me.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\p{L}\\p{N}_])@${escaped}(?![\\p{L}\\p{N}_])`, 'iu').test(text)
}
