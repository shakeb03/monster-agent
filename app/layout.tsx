import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'
import { UserProvider } from '@/components/providers/user-provider'
import { clerkTheme } from '@/lib/clerk/theme'

const inter = Inter({ subsets: ['latin'] })

export const metadata = {
  title: 'LinkedIn Content Agent',
  description: 'AI-powered LinkedIn content creation in your style',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ClerkProvider
      appearance={{
        baseTheme: dark,
        variables: clerkTheme.variables,
      }}
    >
      <html lang="en" className="dark">
        <body className={inter.className}>
          <UserProvider>
            {children}
          </UserProvider>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  )
}
