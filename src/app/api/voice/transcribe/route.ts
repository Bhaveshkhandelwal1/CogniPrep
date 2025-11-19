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
    const formData = await req.formData()
    const audioFile = formData.get("audio") as File

    if (!audioFile) {
      return NextResponse.json(
        { error: "Audio file is required" },
        { status: 400 }
      )
    }

    // Convert File to OpenAI File format
    const audioBuffer = await audioFile.arrayBuffer()
    const audioBlob = new Blob([audioBuffer], { type: audioFile.type })

    // Create a File-like object for OpenAI
    const file = new File([audioBlob], audioFile.name, { type: audioFile.type })

    // Use OpenAI Whisper API for transcription
    const transcription = await openai.audio.transcriptions.create({
      file: file,
      model: "whisper-1",
      language: "en",
    })

    return NextResponse.json({
      text: transcription.text,
    })
  } catch (error: unknown) {
    console.error("Transcription error:", error)
    
    // Provide more detailed error messages
    let errorMessage = "Failed to transcribe audio"
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
    } else if (errorMessage.includes("file") || errorMessage.includes("format")) {
      errorMessage = "Invalid audio file format. Please try again."
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}

