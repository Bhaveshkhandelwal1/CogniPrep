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

export async function upsertUser(user: Prisma.UserCreateInput, shouldRevalidate = true) {
  if (!isDatabaseAvailable()) {
    console.error("Database not available. Cannot upsert user.")
    throw new Error("Database not configured")
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaClient = prisma as any
    await prismaClient.user.upsert({
    where: { id: user.id },
    create: user,
    update: user,
    })

    // Only revalidate cache if not called during render (shouldRevalidate flag)
    // Revalidation during render causes Next.js errors
    if (shouldRevalidate) {
      revalidateUserCache(user.id as string)
    }
  } catch (error) {
    // Handle unique constraint errors gracefully (race condition)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaError = error as any
    if (prismaError?.code === 'P2002') {
      // User already exists, which is fine for upsert
      // Try to fetch the existing user
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const prismaClient = prisma as any
        await prismaClient.user.update({
          where: { id: user.id },
          data: user,
        })
        if (shouldRevalidate) {
  revalidateUserCache(user.id as string)
        }
      } catch (updateError) {
        // If update also fails, log but don't throw (user might have been created by another request)
        console.warn("User upsert failed, but may have been created by another request:", updateError)
      }
    } else {
      // Re-throw other errors
      throw error
    }
  }
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
