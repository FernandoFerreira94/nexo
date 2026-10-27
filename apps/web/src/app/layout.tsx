import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import type { ReactNode } from 'react'
import { Splash, SPLASH_BOOT_SCRIPT } from '@/components/brand/splash'
import { TooltipProvider } from '@/components/ui/tooltip'
import './globals.css'

// Geist: sem serifa, neutra e legível em tamanhos pequenos (bom para painéis densos).
const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Nexo Assist',
  description: 'Service desk de TI da Nexo',
  icons: { icon: '/icon.svg' },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SPLASH_BOOT_SCRIPT }} />
      </head>
      <body className="min-h-dvh font-sans">
        <Splash />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  )
}
