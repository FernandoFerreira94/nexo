import type { MetadataRoute } from 'next'

/** Manifesto do app instalável (PWA): ícone, nome e janela própria no celular e no desktop. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Nexo Assist',
    short_name: 'Nexo Assist',
    description: 'Service desk de TI da Nexo: assistente de chat e console do analista.',
    lang: 'pt-BR',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f9fafc',
    theme_color: '#2d50b8',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      { name: 'Abrir o chat', url: '/chat' },
      { name: 'Console do analista', url: '/console' },
    ],
  }
}
