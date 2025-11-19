import { prisma } from "@/lib/prisma"
import { revalidateUserCache } from "./dbCache"
import { Prisma } from "@prisma/client"

// Check if database is configured and prisma.user is available
// Prioritize DATABASE_URL over individual variables
function isDatabaseAvailable(): boolean {
  const hasDatabase = !!process.env.DATABASE_URL
  
  if (!hasDatabase) {
    return false
  }

  // Check if prisma is properly initialized and has the user property
  if (!prisma || typeof prisma !== 'object' || !('user' in prisma)) {
    return false
  }
  
  // Check if prisma.user exists and has the required methods
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaClient = prisma as any
  return !!(prismaClient.user && typeof prismaClient.user.upsert === 'function')
}

export async function upsertUser(user: Prisma.UserCreateInput) {
  if (!isDatabaseAvailable()) {
    console.error("Database not available. Cannot upsert user.")
    throw new Error("Database not configured")
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaClient = prisma as any
  await prismaClient.user.upsert({
    where: { id: user.id },
    create: user,
    update: user,
    })

  revalidateUserCache(user.id as string)
}

export async function deleteUser(id: string) {
  if (!isDatabaseAvailable()) {
    console.error("Database not available. Cannot delete user.")
    throw new Error("Database not configured")
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prismaClient = prisma as any
  await prismaClient.user.delete({
    where: { id },
  })

  revalidateUserCache(id)
}
