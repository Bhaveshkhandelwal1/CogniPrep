import { createEnv } from "@t3-oss/env-nextjs"
import z from "zod"

// Skip validation during build time
const isBuildTime = process.env.NEXT_PHASE === "phase-production-build" || 
                     process.env.CI === "true" ||
                     process.env.VERCEL === "1"

export const env = createEnv({
  client: {
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: z.string().min(1),
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL: z.string().min(1),
    NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL: z.string().min(1),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
  },
  emptyStringAsUndefined: true,
  skipValidation: isBuildTime || process.env.SKIP_ENV_VALIDATION === "true",
  experimental__runtimeEnv: {
    NEXT_PUBLIC_CLERK_SIGN_IN_URL: process.env.NEXT_PUBLIC_CLERK_SIGN_IN_URL,
    NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
    NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL:
      process.env.NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  },
})
