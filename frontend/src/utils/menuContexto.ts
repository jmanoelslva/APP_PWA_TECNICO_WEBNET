/** Menu de segurar só em campos de texto. */

const CAMPOS = 'input, textarea, [contenteditable]:not([contenteditable="false"])'

/** O menu de contexto vale aqui? Só dentro de campos de entrada. */
export function permiteMenuContexto(alvo: EventTarget | null): boolean {
  return alvo instanceof Element && alvo.closest(CAMPOS) !== null
}

export function iniciarSemMenuContexto(): void {
  document.addEventListener('contextmenu', (evento) => {
    if (!permiteMenuContexto(evento.target)) evento.preventDefault()
  })
}
