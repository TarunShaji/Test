import './globals.css'
import { Inter } from 'next/font/google'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'CubeHQ Dashboard',
  description: 'Internal dashboard and client portal for marketing agencies',
}

import { SWRProvider } from '@/components/SWRProvider'
import ErrorBoundary from '@/components/ErrorBoundary'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"){e.stopImmediatePropagation();e.preventDefault()}},true);' }} />
      </head>
      <body className={inter.className}>
        <ErrorBoundary>
          <SWRProvider>
            {children}
          </SWRProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
