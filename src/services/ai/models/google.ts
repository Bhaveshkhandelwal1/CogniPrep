import { env } from "@/data/env/server"
import { createGoogleGenerativeAI } from "@ai-sdk/google"

// Only create Google AI client if API key is available
export const google = env.GEMINI_API_KEY 
  ? createGoogleGenerativeAI({
      apiKey: env.GEMINI_API_KEY,
    })
  : null
