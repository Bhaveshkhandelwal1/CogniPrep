import { env } from "@/data/env/server"
import { NextResponse } from "next/server"
import OpenAI from "openai"

const openai = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null

export async function POST(req: Request) {
  if (!openai) {
    return NextResponse.json(
      { error: "OpenAI API key not configured" },
      { status: 500 }
    )
  }

  try {
    const { text } = await req.json()

    if (!text || typeof text !== "string") {
      return NextResponse.json(
        { error: "Text is required" },
        { status: 400 }
      )
    }

    // Use OpenAI TTS API
    const mp3 = await openai.audio.speech.create({
      model: "tts-1", // Use tts-1 for faster, cheaper responses (tts-1-hd for higher quality)
      voice: "alloy", // Options: alloy, echo, fable, onyx, nova, shimmer
      input: text,
      response_format: "mp3",
    })

    // Convert response to buffer
    const buffer = Buffer.from(await mp3.arrayBuffer())

    // Return audio as MP3
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": buffer.length.toString(),
      },
    })
  } catch (error: unknown) {
    console.error("TTS error:", error)
    
    // Provide more detailed error messages
    let errorMessage = "Failed to generate speech"
    if (error instanceof Error) {
      errorMessage = error.message
    } else if (
      typeof error === "object" &&
      error !== null &&
      "error" in error &&
      typeof error.error === "object" &&
      error.error !== null &&
      "message" in error.error &&
      typeof error.error.message === "string"
    ) {
      errorMessage = error.error.message
    } else if (typeof error === "string") {
      errorMessage = error
    }
    
    // Check for specific OpenAI API errors
    if (errorMessage.includes("api key") || errorMessage.includes("authentication")) {
      errorMessage = "Invalid OpenAI API key. Please check your OPENAI_API_KEY in .env file."
    } else if (errorMessage.includes("insufficient_quota") || errorMessage.includes("quota")) {
      errorMessage = "OpenAI API quota exceeded. Please check your account balance."
    } else if (errorMessage.includes("rate_limit")) {
      errorMessage = "OpenAI API rate limit exceeded. Please try again in a moment."
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

