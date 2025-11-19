// Construct DATABASE_URL from individual environment variables BEFORE importing PrismaClient
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
    // Log missing variables for debugging
    console.warn('Warning: DATABASE_URL not set and individual DB variables are missing:', {
      hasHost: !!DB_HOST,
      hasUser: !!DB_USER,
      hasPassword: !!DB_PASSWORD,
      hasPort: !!DB_PORT,
      hasName: !!DB_NAME,
    })
  }
}

import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

