import arcjet, { detectBot, shield, slidingWindow } from "@arcjet/next"
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server"

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/",
  "/api/webhooks(.*)",
])

// Get Arcjet key directly from environment (middleware runs on Edge, env validation might fail)
// Use direct env access to avoid validation errors in middleware
const arcjetKey = process.env.ARCJET_KEY

// Only initialize Arcjet if key is available
const aj = arcjetKey ? arcjet({
  key: arcjetKey,
  rules: [
    shield({ 
      mode: process.env.NODE_ENV === "production" ? "LIVE" : "DRY_RUN",
    }),
    detectBot({
      mode: process.env.NODE_ENV === "production" ? "LIVE" : "DRY_RUN",
      allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:MONITOR", "CATEGORY:PREVIEW"],
    }),
    slidingWindow({
      mode: process.env.NODE_ENV === "production" ? "LIVE" : "DRY_RUN",
      interval: "1m",
      max: 100,
    }),
  ],
}) : null

export default clerkMiddleware(async (auth, req) => {
  try {
    // Only run Arcjet protection if it's initialized
    if (aj) {
      const decision = await aj.protect(req)

      if (decision.isDenied()) {
        return new Response(null, { status: 403 })
      }
    }

    if (!isPublicRoute(req)) {
      await auth.protect()
    }
  } catch (error) {
    // Log error but don't block the request
    console.error("Middleware error:", error)
    // Still protect routes that need authentication
    if (!isPublicRoute(req)) {
      await auth.protect()
    }
  }
})

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
}
