import { auth } from "@clerk/nextjs/server"

type Permission =
  | "unlimited_resume_analysis"
  | "unlimited_interviews"
  | "unlimited_questions"
  | "1_interview"
  | "5_questions"

export async function hasPermission(permission: Permission) {
  try {
  const { has } = await auth()
    const result = await has({ feature: permission })
    
    // In development, log the permission check for debugging
    if (process.env.NODE_ENV === "development") {
      console.log(`Permission check for "${permission}":`, result)
    }
    
    return result
  } catch (error) {
    // If there's an error checking permissions, allow in development
    if (process.env.NODE_ENV === "development") {
      console.warn(`Error checking permission "${permission}":`, error)
      return true
    }
    return false
  }
}
