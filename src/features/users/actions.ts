"use server"

import { prisma } from "@/lib/prisma"

export async function getUser(id: string) {
  // Don't use cache to ensure fresh data during onboarding
  // This prevents stale cache issues when user is created
  
  // Check if database is configured - prioritize DATABASE_URL
  const hasDatabase = !!process.env.DATABASE_URL
  
  if (!hasDatabase) {
    return null
  }

  try {
    // Check if prisma is properly initialized and has the user property
    // When DB is not configured, prisma might be an empty object {}
    if (!prisma || typeof prisma !== 'object' || !('user' in prisma)) {
      return null
    }
    
    // Check if prisma.user exists and is a function (Prisma model)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaClient = prisma as any
    if (!prismaClient.user || typeof prismaClient.user.findUnique !== 'function') {
      return null
    }
    
    return await prismaClient.user.findUnique({
    where: { id },
  })
  } catch (error) {
    // If database query fails, return null (graceful degradation)
    console.error("Database query error:", error)
    return null
  }
}
