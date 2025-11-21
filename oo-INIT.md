# 00-INIT.md - Project Initialization

## Prerequisites
- Node.js 18.x or higher
- npm or pnpm
- Supabase account
- Clerk account
- OpenAI API key
- Apify API key

## Step 1: Create Next.js Project

```bash
npx create-next-app@14 . --typescript --tailwind --app --no-src-dir
```

## Step 2: Install Core Dependencies

```bash
npm install @clerk/nextjs @supabase/supabase-js openai ai zod
npm install @radix-ui/react-dialog @radix-ui/react-dropdown-menu @radix-ui/react-slot @radix-ui/react-toast
npm install class-variance-authority clsx tailwind-merge lucide-react
npm install date-fns uuid
npm install -D @types/uuid
```

## Step 3: Install shadcn/ui

```bash
npx shadcn-ui@latest init
```

When prompted:
- Style: Default
- Base color: Slate
- CSS variables: Yes

Install required components:
```bash
npx shadcn-ui@latest add button input textarea scroll-area separator toast avatar badge card
```

## Step 4: Project Structure

Create the following directory structure:

```
monster-agent/
├── app/
│   ├── (auth)/
│   │   ├── sign-in/[[...sign-in]]/
│   │   │   └── page.tsx
│   │   └── sign-up/[[...sign-up]]/
│   │       └── page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   └── chat/
│   │       ├── page.tsx
│   │       └── [chatId]/
│   │           └── page.tsx
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts
│   │   ├── onboarding/
│   │   │   ├── linkedin-profile/
│   │   │   │   └── route.ts
│   │   │   ├── linkedin-posts/
│   │   │   │   └── route.ts
│   │   │   ├── analyze-posts/
│   │   │   │   └── route.ts
│   │   │   └── goals/
│   │   │       └── route.ts
│   │   ├── context/
│   │   │   ├── summarize/
│   │   │   │   └── route.ts
│   │   │   └── batch/
│   │   │       └── route.ts
│   │   └── analysis/
│   │       └── route.ts
│   ├── layout.tsx
│   └── globals.css
├── lib/
│   ├── supabase/
│   │   ├── client.ts
│   │   └── server.ts
│   ├── openai/
│   │   ├── client.ts
│   │   └── embeddings.ts
│   ├── apify/
│   │   └── client.ts
│   ├── context/
│   │   ├── manager.ts
│   │   └── summarizer.ts
│   └── utils.ts
├── components/
│   ├── chat/
│   │   ├── chat-interface.tsx
│   │   ├── chat-message.tsx
│   │   ├── chat-input.tsx
│   │   └── chat-sidebar.tsx
│   ├── onboarding/
│   │   ├── onboarding-chat.tsx
│   │   └── linkedin-url-input.tsx
│   ├── analysis/
│   │   ├── analysis-panel.tsx
│   │   ├── voice-analysis.tsx
│   │   ├── top-posts.tsx
│   │   └── metrics-display.tsx
│   └── ui/
│       └── [shadcn components]
├── types/
│   ├── database.ts
│   ├── chat.ts
│   ├── analysis.ts
│   └── onboarding.ts
└── middleware.ts
```

## Step 5: Environment Variables

Create `.env.local`:

```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxxxx
CLERK_SECRET_KEY=sk_test_xxxxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/chat
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/chat

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxxxx
SUPABASE_SERVICE_ROLE_KEY=eyJxxxxx

# OpenAI
OPENAI_API_KEY=sk-xxxxx

# Apify
APIFY_API_KEY=apify_api_xxxxx

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Step 6: Configure Tailwind for Dark Mode

Update `tailwind.config.ts`:

```typescript
import type { Config } from "tailwindcss"

const config = {
  darkMode: ["class"],
  content: [
    './pages/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}',
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config

export default config
```

## Step 7: Update globals.css

Replace `app/globals.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

## Step 8: Root Layout Setup

Update `app/layout.tsx`:

```typescript
import { ClerkProvider } from '@clerk/nextjs'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from '@/components/ui/toaster'

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
    <ClerkProvider>
      <html lang="en" className="dark">
        <body className={inter.className}>
          {children}
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  )
}
```

## Step 9: Middleware for Clerk

Create `middleware.ts`:

```typescript
import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  publicRoutes: ["/sign-in", "/sign-up"],
  ignoredRoutes: ["/api/webhook"],
});

export const config = {
  matcher: ["/((?!.+\\.[\\w]+$|_next).*)", "/", "/(api|trpc)(.*)"],
};
```

## Step 10: Verify Installation

Run the development server:

```bash
npm run dev
```

Visit `http://localhost:3000` to verify the setup.

## Next Steps

Proceed to `01-DATABASE.md` to set up Supabase tables and schemas.