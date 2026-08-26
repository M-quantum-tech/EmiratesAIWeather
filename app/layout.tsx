import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT

const geistSans = Geist({ subsets: ['latin'], variable: '--font-geist-sans' })
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' })

export const metadata: Metadata = {
  title: 'EmiratesAIWeather — AI Climate Intelligence by M-Quantum-Tech',
  description:
    'EmiratesAIWeather by M-Quantum-Tech: AI-driven hyper-local conditions, 24-hour trend, 7-day outlook, air quality and automatic advisories for the United Arab Emirates and beyond.',
  generator: 'v0.app',
  applicationName: 'EmiratesAIWeather',
  keywords: [
    'EmiratesAIWeather',
    'M-Quantum-Tech',
    'UAE weather',
    'weather monitoring',
    'air quality',
    'hourly forecast',
    'weather station',
  ],
  openGraph: {
    title: 'EmiratesAIWeather — AI Climate Intelligence by M-Quantum-Tech',
    description: 'AI-driven hyper-local conditions, 24-hour trend, 7-day outlook, air quality and automatic advisories.',
    type: 'website',
  },
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#161c26',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" className={`bg-background ${geistSans.variable} ${geistMono.variable}`}>
      <body className="font-sans antialiased">
        {children}
        <Analytics />
        {adsenseClient ? (
          <Script
            id="google-adsense"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
          />
        ) : null}
      </body>
    </html>
  )
}
