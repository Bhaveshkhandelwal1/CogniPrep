// Prioritize DATABASE_URL if provided, otherwise construct from individual variables
// This is critical because Prisma validates the schema when PrismaClient is imported
// Next.js automatically loads .env files, but we need to ensure DATABASE_URL is set
if (!process.env.DATABASE_URL) {
  const DB_HOST = process.env.DB_HOST
  const DB_USER = process.env.DB_USER
  const DB_PASSWORD = process.env.DB_PASSWORD
  const DB_PORT = process.env.DB_PORT || '3306'
  const DB_NAME = process.env.DB_NAME
  
  if (DB_HOST && DB_USER && DB_PASSWORD && DB_PORT && DB_NAME) {
    process.env.DATABASE_URL = `mysql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`
  } else {
    // Only log warning if not during build time
    const isBuildTime = process.env.NEXT_PHASE === "phase-production-build" || 
                         process.env.CI === "true" ||
                         process.env.VERCEL === "1"
    
    if (!isBuildTime) {
      // Log missing variables for debugging (only at runtime)
      console.warn('Warning: DATABASE_URL not set and individual DB variables are missing:', {
        hasHost: !!DB_HOST,
        hasUser: !!DB_USER,
        hasPassword: !!DB_PASSWORD,
        hasPort: !!DB_PORT,
        hasName: !!DB_NAME,
      })
    }
  }
}

import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Only create PrismaClient if DATABASE_URL is available (prioritize DATABASE_URL)
// DATABASE_URL takes precedence over individual variables
const shouldCreatePrisma = !!process.env.DATABASE_URL

export const prisma =
  globalForPrisma.prisma ??
  (shouldCreatePrisma 
    ? new PrismaClient({
        log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
      })
    : ({} as PrismaClient))

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

