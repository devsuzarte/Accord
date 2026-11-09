/**
 * Conta travamentos recentes para decidir se ainda vale recuperar sozinho.
 * Ideia do estudo do cliente do Discord (docs/16 §2.8): recarregar depois de um travamento,
 * mas parar quando trava de novo logo em seguida (senão vira um laço de recarregar e travar).
 */
export interface CrashWindow {
  /** Quantos travamentos dentro de `withinMs` fazem desistir. */
  count: number
  withinMs: number
}

export class CrashGuard {
  private times: number[] = []
  private readonly keepMs: number

  constructor(private readonly windows: CrashWindow[]) {
    this.keepMs = Math.max(...windows.map((w) => w.withinMs))
  }

  /** Registra um travamento. `true` = ainda dá para recuperar; `false` = está em laço. */
  record(now = Date.now()): boolean {
    this.times = [...this.times.filter((t) => now - t <= this.keepMs), now]
    return !this.windows.some(
      (w) => this.times.filter((t) => now - t <= w.withinMs).length >= w.count,
    )
  }

  /** Quantos travamentos aconteceram nos últimos `withinMs`. */
  recent(withinMs: number, now = Date.now()): number {
    return this.times.filter((t) => now - t <= withinMs).length
  }

  reset(): void {
    this.times = []
  }
}
