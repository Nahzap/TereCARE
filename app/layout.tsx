import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import { ScrollCorner } from '@/components/scroll-corner'
import { SectionJump } from '@/components/section-jump'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800', '900'],
})

export const metadata: Metadata = {
  title: 'TereCARE',
  description: 'Esquema de medicamentos para cuidadores',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
        <SectionJump />
        <ScrollCorner />
      </body>
    </html>
  )
}
