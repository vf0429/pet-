import './globals.css'
import type { ReactNode } from 'react'

import { I18nProvider } from '@/lib/i18n'

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html lang="en">
      <body><I18nProvider>{children}</I18nProvider></body>
    </html>
  )
}
