/** Windows 10 2004 (build 19041) ou mais novo: exclusão de captura e "process loopback" do som. */
export function windowsBuildAtLeast(build: number): boolean {
  if (process.platform !== 'win32') return false
  const current = Number(process.getSystemVersion().split('.')[2])
  return Number.isFinite(current) && current >= build
}
