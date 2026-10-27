'use client'

import { useEffect, useState } from 'react'
import { LogoMark } from './logo'

const SEEN_KEY = 'nexo-splash-seen'

/**
 * Splash de entrada: aparece uma vez por sessão do navegador (~1,4 s) e some sozinha.
 * Só visual: não bloqueia cliques. Um script no <head> esconde antes de pintar se já foi vista.
 */
export function Splash() {
  const [phase, setPhase] = useState<'show' | 'leave' | 'gone'>('show')

  useEffect(() => {
    if (document.documentElement.dataset.splash === 'off') {
      setPhase('gone')
      return
    }
    sessionStorage.setItem(SEEN_KEY, '1')
    const leave = setTimeout(() => setPhase('leave'), 1100)
    const gone = setTimeout(() => setPhase('gone'), 1500)
    return () => {
      clearTimeout(leave)
      clearTimeout(gone)
    }
  }, [])

  if (phase === 'gone') return null
  return (
    <div
      aria-hidden
      data-splash
      className={`pointer-events-none fixed inset-0 z-[100] grid place-items-center bg-sidebar transition-opacity duration-400 ${
        phase === 'leave' ? 'opacity-0' : 'opacity-100'
      }`}
    >
      <div className="grid justify-items-center gap-5">
        <LogoMark className="size-16 animate-in fade-in-0 zoom-in-75 duration-500" />
        <p className="animate-in fade-in-0 slide-in-from-bottom-2 text-title text-sidebar-foreground delay-200 duration-500 fill-mode-both">
          nexo <span className="font-normal text-sidebar-muted">assist</span>
        </p>
        <div className="h-0.5 w-28 overflow-hidden rounded-full bg-sidebar-accent">
          <div className="h-full w-full origin-left animate-[splash-progress_1.1s_ease-out_both] bg-gradient-to-r from-brand-from to-brand-to" />
        </div>
      </div>
    </div>
  )
}

/** Roda antes de pintar a página: se a splash já foi vista nesta sessão, não mostra de novo. */
export const SPLASH_BOOT_SCRIPT = `try{if(sessionStorage.getItem('${SEEN_KEY}'))document.documentElement.dataset.splash='off'}catch(e){}`
