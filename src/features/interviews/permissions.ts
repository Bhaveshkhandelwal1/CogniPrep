import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { hasPermission } from "@/services/clerk/lib/hasPermission"

export async function canCreateInterview() {
  // Free model: Allow unlimited interviews by default
  // Check for unlimited interviews permission first (for paid users with explicit permissions)
  const hasUnlimited = await hasPermission("unlimited_interviews")
  if (hasUnlimited) {
    return true
  }

  // Check for limited interviews (1 interview) - this is for legacy/restricted plans
  const hasLimited = await hasPermission("1_interview")
  if (hasLimited) {
    const count = await getUserInterviewCount()
    return count < 1
  }

  // Free model: Allow unlimited interviews for all users
  // This means free users get unlimited interviews
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
