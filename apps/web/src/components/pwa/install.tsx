'use client'

import { useEffect, useSyncExternalStore } from 'react'

/**
 * App instalável (PWA). O navegador avisa com `beforeinstallprompt` quando dá para instalar;
 * guardamos o evento aqui e qualquer botão "Instalar app" usa o mesmo.
 * Safari (iPhone) não tem esse evento: lá a instalação é pelo menu Compartilhar.
 */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> }

let deferred: InstallEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault() // nós mostramos o botão, no lugar certo
    deferred = event as InstallEvent
    notify()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    notify()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** `install` existe só quando o navegador permite instalar agora. */
export function useInstallApp(): { install: (() => Promise<void>) | null } {
  const available = useSyncExternalStore(
    subscribe,
    () => deferred !== null,
    () => false,
  )
  if (!available) return { install: null }
  return {
    install: async () => {
      const event = deferred
      if (!event) return
      await event.prompt()
      await event.userChoice
      deferred = null
      notify()
    },
  }
}

/** Registra o service worker uma vez (só em produção, para não atrapalhar o `next dev`). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  }, [])
  return null
}
