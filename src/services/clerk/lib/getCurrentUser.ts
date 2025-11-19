import { prisma } from "@/lib/prisma"

// Check if Clerk is configured
function isClerkConfigured(): boolean {
  return !!(process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
}

export async function getCurrentUser({ allData = false } = {}) {
  try {
    // Always try to use Clerk's auth() - it should work if clerkMiddleware is present
    // Even if keys are missing, auth() will return null userId
    const { auth } = await import("@clerk/nextjs/server")
    
    try {
      const { userId, redirectToSignIn } = await auth()

      return {
        userId: userId || null,
        redirectToSignIn,
        user: allData && userId != null ? await getUser(userId) : undefined,
      }
    } catch (authError: unknown) {
      // If auth() fails (e.g., Clerk not properly initialized), return null user
      const errorMessage = authError instanceof Error ? authError.message : String(authError)
      
      // Check if it's the specific error about clerkMiddleware
      if (errorMessage.includes("clerkMiddleware") || errorMessage.includes("can't detect")) {
        // Clerk middleware is not properly set up - return null user
        return {
          userId: null,
          redirectToSignIn: async () => {
            const { redirect } = await import("next/navigation")
            return redirect("/sign-in")
          },
          user: undefined,
        }
      }
      
      // Re-throw other errors
      throw authError
    }
  } catch (error) {
    // If Clerk import or usage fails completely, return null user (graceful degradation)
    console.error("Clerk authentication error:", error)
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
