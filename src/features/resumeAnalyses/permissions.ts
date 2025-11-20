import { hasPermission } from "@/services/clerk/lib/hasPermission"

export async function canRunResumeAnalysis() {
  // Free model: Allow unlimited resume analysis by default
  // Check for unlimited_resume_analysis permission (for paid users with explicit permissions)
  const hasUnlimited = await hasPermission("unlimited_resume_analysis")
  if (hasUnlimited) {
    return true
  }

  // Free model: Allow unlimited resume analysis for all users
  // This means free users get unlimited resume feedback
  return true
}
