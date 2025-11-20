import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { hasPermission } from "@/services/clerk/lib/hasPermission"

export async function canCreateInterview() {
  // Free model: Allow unlimited interviews for all users by default
  // This means free users get unlimited interviews
  
  try {
    // Check for unlimited interviews permission (for paid users with explicit permissions)
    const hasUnlimited = await hasPermission("unlimited_interviews")
    if (hasUnlimited) {
      if (process.env.NODE_ENV === "development") {
        console.log("User has unlimited_interviews permission")
      }
      return true
    }

    // Check for limited interviews (1 interview) - this is for legacy/restricted plans
    // Only enforce this limit if the user explicitly has the limited permission
    const hasLimited = await hasPermission("1_interview")
    if (hasLimited) {
      const count = await getUserInterviewCount()
      const allowed = count < 1
      if (process.env.NODE_ENV === "development") {
        console.log(`User has 1_interview permission, count: ${count}, allowed: ${allowed}`)
      }
      return allowed
    }
  } catch (error) {
    // If permission check fails, allow interviews (free model)
    if (process.env.NODE_ENV === "development") {
      console.warn("Error checking interview permissions, allowing (free model):", error)
    }
  }

  // Free model: Default to allowing unlimited interviews
  if (process.env.NODE_ENV === "development") {
    console.log("Free model: Allowing unlimited interviews")
  }
  return true
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
