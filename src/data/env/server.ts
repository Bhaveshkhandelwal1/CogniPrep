import { createEnv } from "@t3-oss/env-nextjs"
import z from "zod"

// Skip validation during build time OR if SKIP_ENV_VALIDATION is set
// Also skip at runtime if we're in a deployment environment without all keys
const isBuildTime = process.env.NEXT_PHASE === "phase-production-build" || 
                     process.env.CI === "true" ||
                     process.env.VERCEL === "1"

// Check if we should skip validation (build time or explicit flag)
const shouldSkipValidation = isBuildTime || process.env.SKIP_ENV_VALIDATION === "true"

export const env = createEnv({
  server: {
    DB_PASSWORD: z.string().min(1).optional(),
    DB_HOST: z.string().min(1).optional(),
    DB_PORT: z.string().min(1).optional(),
    DB_USER: z.string().min(1).optional(),
    DB_NAME: z.string().min(1).optional(),
    ARCJET_KEY: z.string().min(1).optional(),
    CLERK_SECRET_KEY: z.string().min(1).optional(),
    GEMINI_API_KEY: z.string().min(1).optional(),
    OPENAI_API_KEY: z.string().min(1).optional(),
  },
  createFinalSchema: env => {
    return z.object(env).transform(val => {
      const { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER, ...rest } = val
      // Only create DATABASE_URL if all DB variables are present
      if (DB_HOST && DB_NAME && DB_PASSWORD && DB_PORT && DB_USER) {
        return {
          ...rest,
          DATABASE_URL: `mysql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`,
        }
      }
      return rest
    })
  },
  emptyStringAsUndefined: true,
  skipValidation: shouldSkipValidation,
  experimental__runtimeEnv: process.env,
})
