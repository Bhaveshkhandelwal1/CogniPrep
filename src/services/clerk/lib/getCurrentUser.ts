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
  // Check if database is configured
  const hasDatabase = !!(process.env.DATABASE_URL || 
    (process.env.DB_HOST && process.env.DB_USER && process.env.DB_PASSWORD && process.env.DB_NAME))
  
  if (!hasDatabase) {
    return null
  }

  try {
    // Check if prisma has the user property (it won't if DB is not configured)
    if (!prisma || !('user' in prisma)) {
      return null
    }
    
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prismaClient = prisma as any
    return await prismaClient.user.findUnique({
      where: { id },
    })
  } catch (error) {
    // If database query fails, return null (graceful degradation)
    console.error("Database query error:", error)
    return null
  }
}
