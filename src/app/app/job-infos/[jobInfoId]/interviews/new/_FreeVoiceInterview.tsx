"use client"

import { Button } from "@/components/ui/button"
import { JobInfo } from "@prisma/client"
import { createInterview, updateInterview } from "@/features/interviews/actions"
import { errorToast } from "@/lib/errorToast"
import { useOpenAIVoiceInterview, VoiceInterviewMessage } from "@/services/voice/hooks/useOpenAIVoiceInterview"
import { Loader2Icon, MicIcon, MicOffIcon, PhoneOffIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useRef, useState } from "react"
import { CondensedMessages } from "@/services/hume/components/CondensedMessages"
import { condenseChatMessages } from "@/services/hume/lib/condenseChatMessages"

export function FreeVoiceInterview({
  jobInfo,
  user,
}: {
  jobInfo: Pick<
    JobInfo,
    "id" | "title" | "description" | "experienceLevel"
  >
  user: {
    name: string
    imageUrl: string
  }
}) {
  const [interviewId, setInterviewId] = useState<string | null>(null)
  const [showDebug, setShowDebug] = useState(false)
  const router = useRouter()
  const messagesRef = useRef<VoiceInterviewMessage[]>([])

  const {
    state,
    messages,
    error,
    isMuted,
    isSpeaking,
    callDuration,
    start,
    stop,
    toggleMute,
  } = useOpenAIVoiceInterview({
    jobInfo: {
      title: jobInfo.title,
      description: jobInfo.description,
      experienceLevel: jobInfo.experienceLevel,
    },
    userName: user.name,
    onMessage: (message) => {
      messagesRef.current = [...messagesRef.current, message]
      
      // Messages are stored when the interview ends
    },
  })

  // Create interview when starting
  const handleStart = async () => {
    try {
      const res = await createInterview({ jobInfoId: jobInfo.id })
      if (res.error) {
        return errorToast(res.message)
      }
      setInterviewId(res.id)
      await start()
    } catch (err) {
      console.error("Failed to start interview:", err)
      errorToast("Failed to start interview. Please try again.")
    }
  }

  // Handle disconnect
  const handleDisconnect = async () => {
    stop()
    if (interviewId) {
      // Save messages to database
      const messagesJson = JSON.stringify(messagesRef.current)
      // Format duration as MM:SS
      const minutes = Math.floor(callDuration / 60)
      const seconds = callDuration % 60
      const duration = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
      await updateInterview(interviewId, { 
        duration,
        messages: messagesJson,
      })
      router.push(`/app/job-infos/${jobInfo.id}/interviews/${interviewId}`)
    } else {
      router.push(`/app/job-infos/${jobInfo.id}/interviews`)
    }
  }

  // Convert messages to format expected by CondensedMessages
  const condensedMessages = condenseChatMessages(
    messages.map(msg => ({
      type: msg.role === "user" ? "USER_MESSAGE" : "AGENT_MESSAGE",
      messageText: msg.text,
      role: msg.role === "user" ? "USER" : "ASSISTANT",
      timestamp: msg.timestamp.getTime(),
    }))
  )

  if (state === "idle") {
    return (
      <div className="flex flex-col justify-center items-center h-screen-header gap-4">
        {error && (
          <div className="text-destructive text-center max-w-md px-4">
            {error}
          </div>
        )}
        <div className="text-center max-w-md px-4 text-muted-foreground">
          <p className="mb-2">Ready to start your free AI-powered interview practice.</p>
          <p className="text-sm">Powered by browser-native Web Speech APIs - completely free, unlimited, and no API keys required!</p>
          <p className="text-xs mt-2 text-muted-foreground/80">
            Note: For best results, please use Chrome, Edge, or Safari and allow microphone access.
          </p>
        </div>
        <Button size="lg" onClick={handleStart}>
          Start Interview
        </Button>
      </div>
    )
  }

  if (state === "connecting" || state === "processing") {
    return (
      <div className="h-screen-header flex items-center justify-center">
        <Loader2Icon className="animate-spin size-24" />
      </div>
    )
  }

  if (state === "error") {
    return (
      <div className="flex flex-col justify-center items-center h-screen-header gap-4 text-center max-w-md mx-auto px-4">
        <p className="text-xl font-semibold">Unable to start interview</p>
        <p className="text-muted-foreground">{error || "An error occurred. Please try again."}</p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => router.refresh()}>
            Refresh Page
          </Button>
          <Button onClick={() => {
            setInterviewId(null)
            handleStart()
          }}>
            Try Again
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-screen-header flex flex-col-reverse">
      <div className="container py-6 flex flex-col items-center justify-end gap-4">
        <Messages user={user} messages={condensedMessages} />
        <Controls
          isMuted={isMuted}
          isSpeaking={isSpeaking}
          callDuration={formatDuration(callDuration)}
          onToggleMute={toggleMute}
          onDisconnect={handleDisconnect}
          isListening={state === "listening"}
        />
        {/* Debug panel - always show on Vercel for debugging */}
        <div className="fixed top-4 right-4 z-50">
          <button
            onClick={() => setShowDebug(!showDebug)}
            className="text-xs bg-muted px-2 py-1 rounded"
          >
            {showDebug ? "Hide Debug" : "Show Debug"}
          </button>
          {showDebug && (
            <div className="mt-2 bg-background border rounded p-4 text-xs max-w-xs max-h-64 overflow-auto">
              <div className="font-bold mb-2">Connection Status:</div>
              <div>State: {state}</div>
              <div>Messages: {messages.length}</div>
              <div>Duration: {callDuration}s</div>
              <div>Interview ID: {interviewId || "None"}</div>
              <div>Is Speaking: {isSpeaking ? "Yes" : "No"}</div>
              <div>Is Muted: {isMuted ? "Yes" : "No"}</div>
              <div className="mt-2 font-bold">Browser Support:</div>
              <div>Speech Synthesis: {typeof window !== "undefined" && "speechSynthesis" in window ? "Yes" : "No"}</div>
              <div>Speech Recognition: {typeof window !== "undefined" && (
                (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
              ) ? "Yes" : "No"}</div>
              <div>Microphone: {typeof navigator !== "undefined" && navigator.mediaDevices ? "Yes" : "No"}</div>
              {error && (
                <>
                  <div className="mt-2 font-bold text-destructive">Error:</div>
                  <div className="text-destructive">{error}</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Messages({
  user,
  messages,
}: {
  user: { name: string; imageUrl: string }
  messages: ReturnType<typeof condenseChatMessages>
}) {
  return (
    <CondensedMessages
      messages={messages}
      user={user}
      maxFft={0}
      className="max-w-5xl"
    />
  )
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`
}

function Controls({
  isMuted,
  isSpeaking,
  callDuration,
  onToggleMute,
  onDisconnect,
  isListening,
}: {
  isMuted: boolean
  isSpeaking: boolean
  callDuration: string
  onToggleMute: () => void
  onDisconnect: () => void
  isListening?: boolean
}) {
  return (
    <div className="flex gap-5 rounded border px-5 py-2 w-fit sticky bottom-6 bg-background items-center">
      <Button
        variant="ghost"
        size="icon"
        className="-mx-3"
        onClick={onToggleMute}
      >
        {isMuted ? <MicOffIcon className="text-destructive" /> : <MicIcon />}
        <span className="sr-only">{isMuted ? "Unmute" : "Mute"}</span>
      </Button>
      <div className="text-sm text-muted-foreground tabular-nums">
        {callDuration}
      </div>
      {isSpeaking && (
        <div className="text-xs text-muted-foreground italic">
          AI is speaking...
        </div>
      )}
      {isListening && !isSpeaking && !isMuted && (
        <div className="flex items-center gap-2 text-xs text-primary">
          <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
          <span>Listening...</span>
        </div>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="-mx-3"
        onClick={onDisconnect}
      >
        <PhoneOffIcon className="text-destructive" />
        <span className="sr-only">End Call</span>
      </Button>
    </div>
  )
}

