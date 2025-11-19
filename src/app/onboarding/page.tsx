import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { redirect } from "next/navigation"
import { OnboardingClient } from "./_client"
import { currentUser } from "@clerk/nextjs/server"
import { upsertUser } from "@/features/users/db"
import { revalidatePath } from "next/cache"

// Mark as dynamic since we use getCurrentUser() which calls auth() and uses headers()
export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const { userId, user } = await getCurrentUser({ allData: true })

  if (userId == null) return redirect("/")
  
  // If user already exists in database, redirect to app
  if (user != null) {
    return redirect("/app")
  }
  
  // User doesn't exist in database, try to create it from Clerk data
  try {
    const clerkData = await currentUser()
    
    if (clerkData) {
      const email = clerkData.emailAddresses.find(
        e => e.id === clerkData.primaryEmailAddressId
      )?.emailAddress
      
      if (email) {
        // Create user in database
        // Pass shouldRevalidate=false to avoid revalidateTag during render
        // We'll use revalidatePath instead which is safe during render
        await upsertUser({
          id: clerkData.id,
          email,
          name: `${clerkData.firstName || ""} ${clerkData.lastName || ""}`.trim() || email.split("@")[0],
          imageUrl: clerkData.imageUrl,
        }, false) // Don't revalidate cache during render
        
        // Revalidate the cache to ensure fresh data (safe during render)
        revalidatePath("/app")
        revalidatePath("/onboarding")
        
        // Redirect to app after creating user
        redirect("/app")
      }
    }
  } catch (error) {
    console.error("Error creating user from Clerk data:", error)
    // If creation fails, show onboarding page and let client component handle it
  }

  // Show loading screen while waiting for user to be created (via webhook or retry)
  return (
    <div className="container flex flex-col items-center justify-center h-screen gap-4">
      <h1 className="text-4xl">Creating your account...</h1>
      <OnboardingClient userId={userId} />
    </div>
  )
}
