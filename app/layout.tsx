import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DayFlow — Daily Planner',
  description: 'A calm, minimal daily planner',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">{children}</body>
    </html>
  )
}
