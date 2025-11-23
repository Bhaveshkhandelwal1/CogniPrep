import { getCurrentUser } from "@/services/clerk/lib/getCurrentUser"
import { generateInterviewResponse } from "@/services/voice/ai/interviewConversation"
import { z } from "zod"

const schema = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      timestamp: z.string(),
    })
  ),
  jobInfo: z.object({
    title: z.string().nullable().optional(),
    description: z.string(),
    experienceLevel: z.string(),
  }),
  userName: z.string(),
})

export async function POST(req: Request) {
  try {
    const { userId } = await getCurrentUser()
    if (userId == null) {
      return new Response("You are not logged in", { status: 401 })
    }

    const body = await req.json()
    const result = schema.safeParse(body)

    if (!result.success) {
      return new Response("Invalid request body", { status: 400 })
    }

    const { messages, jobInfo, userName } = result.data

    try {
      const response = await generateInterviewResponse({
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
        })),
        jobInfo,
        userName,
      })

      return Response.json({ response })
    } catch (error) {
      console.error("Failed to generate interview response:", error)
      const errorMessage = error instanceof Error ? error.message : "Failed to generate response"
      const errorDetails = error instanceof Error ? error.stack : String(error)
      console.error("Error details:", errorDetails)
      return Response.json(
        { error: errorMessage, details: process.env.NODE_ENV === "development" ? errorDetails : undefined },
        { status: 500 }
      )
    }
  } catch (error) {
    // Handle middleware rate limit errors
    console.error("Request error:", error)
    return Response.json(
      { error: "Request failed. Please try again." },
      { status: 500 }
    )
  }
}

