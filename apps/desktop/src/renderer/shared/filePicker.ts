/**
 * Abre a janela de escolher arquivo sem o painel fechar: o painel fecha quando perde o foco,
 * e a janela do sistema tira o foco dele. Enquanto ela está aberta, o main segura o painel.
 */
export function openFilePicker(input: HTMLInputElement | null): void {
  if (!input) return
  window.platform.panel.hold(true)
  let released = false
  const release = () => {
    if (released) return
    released = true
    input.removeEventListener('change', release)
    input.removeEventListener('cancel', release)
    window.removeEventListener('focus', onFocus)
    window.platform.panel.hold(false)
  }
  // O foco volta ao painel quando a janela do sistema fecha (escolheu ou cancelou).
  const onFocus = () => setTimeout(release, 300)
  input.addEventListener('change', release)
  input.addEventListener('cancel', release)
  window.addEventListener('focus', onFocus)
  input.click()
}
