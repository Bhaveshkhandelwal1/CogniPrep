import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { hasPermission } from "@/services/clerk/lib/hasPermission"

export async function canCreateInterview() {
  // Check for unlimited interviews permission first
  const hasUnlimited = await hasPermission("unlimited_interviews")
  if (hasUnlimited) {
    return true
  }

  // Check for limited interviews (1 interview)
  const hasLimited = await hasPermission("1_interview")
  if (hasLimited) {
    const count = await getUserInterviewCount()
    return count < 1
  }

  // In development mode, allow interviews if no permissions are set
  // This helps when testing or if Clerk features aren't configured yet
  if (process.env.NODE_ENV === "development") {
    console.log("Development mode: Allowing interview creation (no permission restrictions)")
    return true
  }

  // No permission found, deny access
  return false
}

async function getUserInterviewCount() {
  const { userId } = await getCurrentUser()
  if (userId == null) return 0

  return getInterviewCount(userId)
}

async function getInterviewCount(userId: string) {
  const count = await prisma.interview.count({
    where: {
      jobInfo: {
        userId,
      },
      messages: {
        not: null,
      },
    },
  })

  return count
}
