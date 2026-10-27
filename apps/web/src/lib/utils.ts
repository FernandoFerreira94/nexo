import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Ensina ao tailwind-merge que text-display/title/… são TAMANHOS de fonte (globals.css),
// senão ele confunde com cor e descarta uma das duas classes.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: ['display', 'title', 'heading', 'body', 'caption', 'overline'] }],
    },
  },
})

/** Junta classes do Tailwind resolvendo conflitos (padrão do shadcn/ui). */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
