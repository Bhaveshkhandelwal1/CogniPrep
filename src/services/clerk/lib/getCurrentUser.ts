import { prisma } from "@/lib/prisma"

// Check if Clerk is configured
function isClerkConfigured(): boolean {
  return !!(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
}

export async function getCurrentUser({ allData = false } = {}) {
  // If Clerk is not configured, don't call auth() at all - return null immediately
  // This prevents the "can't detect clerkMiddleware" error
  if (!isClerkConfigured()) {
    return {
      userId: null,
      redirectToSignIn: async () => {
        const { redirect } = await import("next/navigation")
        return redirect("/sign-in")
      },
      user: undefined,
    }
  }

  try {
    // Only call auth() if Clerk is configured
    const { auth } = await import("@clerk/nextjs/server")
  const { userId, redirectToSignIn } = await auth()

  return {
      userId: userId || null,
    redirectToSignIn,
    user: allData && userId != null ? await getUser(userId) : undefined,
    }
  } catch (error) {
    // If Clerk fails, return null user (graceful degradation)
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.error("Clerk authentication error:", errorMessage)
    
    return {
      userId: null,
      redirectToSignIn: async () => {
        const { redirect } = await import("next/navigation")
        return redirect("/sign-in")
      },
      user: undefined,
    }
  }
}

async function getUser(id: string) {
  // Don't use cache for user lookups to prevent stale data during onboarding
  // This ensures fresh data is always fetched from the database
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
    // Handle Prisma connection errors gracefully
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaError = error as any
    
    // Check for PrismaClientInitializationError (database connection issues)
    if (
      prismaError?.name === 'PrismaClientInitializationError' ||
      prismaError?.errorCode === 'P1001' ||
      prismaError?.code === 'P1001' ||
      (typeof prismaError?.message === 'string' && 
       prismaError.message.includes("Can't reach database server"))
    ) {
      // Database connection error - return null gracefully
      if (process.env.NODE_ENV === 'development') {
        console.warn("Database connection error (server may be unreachable):", prismaError.message)
      }
      return null
    }
    
    // If database query fails for other reasons, return null (graceful degradation)
    if (process.env.NODE_ENV === 'development') {
      console.error("Database query error:", error)
    }
    return null
  }
}
