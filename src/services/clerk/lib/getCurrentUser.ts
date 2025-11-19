import { prisma } from "@/lib/prisma"
import { auth } from "@clerk/nextjs/server"

export async function getCurrentUser({ allData = false } = {}) {
  const { userId, redirectToSignIn } = await auth()

  return {
    userId,
    redirectToSignIn,
    user: allData && userId != null ? await getUser(userId) : undefined,
  }
}

async function getUser(id: string) {
  // Don't use cache for user lookups to prevent stale data during onboarding
  // This ensures fresh data is always fetched from the database
  return prisma.user.findUnique({
    where: { id },
  })
}
