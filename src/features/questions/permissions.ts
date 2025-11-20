import { prisma } from "@/lib/prisma"
import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { hasPermission } from "@/services/clerk/lib/hasPermission"

export async function canCreateQuestion() {
  // Free model: Allow unlimited questions by default
  // Check for unlimited questions permission first (for paid users with explicit permissions)
  const hasUnlimited = await hasPermission("unlimited_questions")
  if (hasUnlimited) {
    return true
  }

  // Check for limited questions (5 questions) - this is for legacy/restricted plans
  const hasLimited = await hasPermission("5_questions")
  if (hasLimited) {
    const count = await getUserQuestionCount()
    return count < 5
  }

  // Free model: Allow unlimited questions for all users
  // This means free users get unlimited questions
  return true
}

async function getUserQuestionCount() {
  const { userId } = await getCurrentUser()
  if (userId == null) return 0

  return getQuestionCount(userId)
}

async function getQuestionCount(userId: string) {
  const count = await prisma.question.count({
    where: {
      jobInfo: {
        userId,
      },
    },
  })

  return count
}
