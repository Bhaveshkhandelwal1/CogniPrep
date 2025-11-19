import { createEnv } from "@t3-oss/env-nextjs"
import z from "zod"

// Skip validation during build time (when NEXT_PHASE is 'phase-production-build' or when CI)
const isBuildTime = process.env.NEXT_PHASE === "phase-production-build" || 
                     process.env.CI === "true" ||
                     process.env.VERCEL === "1"

export const env = createEnv({
  server: {
    DB_PASSWORD: z.string().min(1),
    DB_HOST: z.string().min(1),
    DB_PORT: z.string().min(1),
    DB_USER: z.string().min(1),
    DB_NAME: z.string().min(1),
    ARCJET_KEY: z.string().min(1),
    CLERK_SECRET_KEY: z.string().min(1),
    GEMINI_API_KEY: z.string().min(1),
    OPENAI_API_KEY: z.string().min(1).optional(),
  },
  createFinalSchema: env => {
    return z.object(env).transform(val => {
      const { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER, ...rest } = val
      return {
        ...rest,
        DATABASE_URL: `mysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`,
      }
    })
  },
  emptyStringAsUndefined: true,
  skipValidation: isBuildTime || process.env.SKIP_ENV_VALIDATION === "true",
  experimental__runtimeEnv: process.env,
})
