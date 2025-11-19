"use client"

import { useEffect, useRef, useState, useCallback } from "react"

export type VoiceInterviewState = "idle" | "connecting" | "connected" | "speaking" | "listening" | "processing" | "error"

export interface VoiceInterviewMessage {
  role: "user" | "assistant"
  text: string
  timestamp: Date
}

interface UseOpenAIVoiceInterviewProps {
  jobInfo: {
    title?: string | null
    description: string
    experienceLevel: string
  }
  userName: string
  onMessage?: (message: VoiceInterviewMessage) => void
}

export function useOpenAIVoiceInterview({
  jobInfo,
  userName,
  onMessage,
}: UseOpenAIVoiceInterviewProps) {
  const [state, setState] = useState<VoiceInterviewState>("idle")
  const [messages, setMessages] = useState<VoiceInterviewMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [callDuration, setCallDuration] = useState(0)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<Date | null>(null)
  const messagesRef = useRef<VoiceInterviewMessage[]>([])
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const useWebSpeechFallback = useRef(true) // Default to Web Speech API (free, unlimited)
  const useWebRecognitionFallback = useRef(true) // Default to Web Speech Recognition (free, unlimited)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const isProcessingRef = useRef(false) // Track if we're processing to avoid duplicate detections

  // Update messagesRef whenever messages state changes
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Initialize audio element for playback
  useEffect(() => {
    if (typeof window !== "undefined") {
      audioRef.current = new Audio()
      audioRef.current.onended = () => {
        setIsSpeaking(false)
        if (state !== "error" && !isMuted && state === "speaking") {
          setState("listening")
          startRecording()
        }
      }
      audioRef.current.onerror = () => {
        setIsSpeaking(false)
        setError("Failed to play audio. Please try again.")
        setState("error")
      }
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [state, isMuted])

  // Speak text using Web Speech API (free, unlimited) with OpenAI TTS as optional premium option
  const speak = useCallback(async (text: string, onEnd?: () => void) => {
    if (!text) return

    // Use Web Speech API by default (completely free, no API keys, no limits)
    // This ensures the interview always works without quota issues
    if (useWebSpeechFallback.current) {
      return speakWithWebSpeech(text, onEnd)
    }

    try {
      setState("speaking")
      setIsSpeaking(true)

      // Call TTS API
      const response = await fetch("/api/voice/tts", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      })

      if (!response.ok) {
        let errorMessage = "Failed to generate speech"
        try {
          const errorData = await response.json()
          errorMessage = errorData.error || errorMessage
        } catch {
          // If response is not JSON, use status text
          errorMessage = `Failed to generate speech: ${response.statusText}`
        }
        
        console.error("TTS API error:", {
          status: response.status,
          statusText: response.statusText,
          error: errorMessage,
        })
        
        // If any OpenAI-related error (quota, API key, authentication, or 500 error), switch to Web Speech fallback
        const isOpenAIError = 
          errorMessage.toLowerCase().includes("quota") || 
          errorMessage.toLowerCase().includes("api key") || 
          errorMessage.toLowerCase().includes("authentication") ||
          errorMessage.toLowerCase().includes("insufficient") ||
          errorMessage.toLowerCase().includes("not configured") ||
          response.status === 500 ||
          response.status === 401 ||
          response.status === 429
        
        if (isOpenAIError) {
          console.warn("OpenAI TTS unavailable, falling back to Web Speech API")
          useWebSpeechFallback.current = true
          return speakWithWebSpeech(text, onEnd)
        }
        
        throw new Error(errorMessage)
      }

      // Get audio blob
      const audioBlob = await response.blob()
      const audioUrl = URL.createObjectURL(audioBlob)

      // Play audio
      if (audioRef.current) {
        audioRef.current.src = audioUrl
        audioRef.current.onended = () => {
          setIsSpeaking(false)
          if (onEnd) onEnd()
          if (state !== "error" && !isMuted) {
            setState("listening")
            // Use refs to avoid dependency issues
            setTimeout(() => {
              if (useWebRecognitionFallback.current && recognitionRef.current) {
                try {
                  recognitionRef.current.start()
                } catch (e) {
                  // Already started or error
                }
              } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
                mediaRecorderRef.current.start()
              }
            }, 300)
          }
        }
        await audioRef.current.play()
      }
    } catch (err: unknown) {
      console.error("Speech error:", err)
      // Try Web Speech fallback if OpenAI fails (catch any network or API errors)
      const errorMsg = err instanceof Error ? err.message : String(err) || ""
      const isOpenAIError = 
        errorMsg.toLowerCase().includes("quota") || 
        errorMsg.toLowerCase().includes("api key") ||
        errorMsg.toLowerCase().includes("authentication") ||
        errorMsg.toLowerCase().includes("insufficient") ||
        errorMsg.toLowerCase().includes("not configured") ||
        errorMsg.toLowerCase().includes("failed to generate speech")
      
      if (!useWebSpeechFallback.current && isOpenAIError) {
        console.warn("Falling back to Web Speech API due to OpenAI error")
        useWebSpeechFallback.current = true
        return speakWithWebSpeech(text, onEnd)
      }
      setIsSpeaking(false)
      setError(`Failed to speak: ${err instanceof Error ? err.message : "Unknown error"}`)
      setState("error")
    }
  }, [state, isMuted])

  // Fallback: Speak using Web Speech API (completely free, no API limits)
  const speakWithWebSpeech = useCallback((text: string, onEnd?: () => void) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("Speech synthesis is not supported in this browser.")
      setState("error")
      return
    }

    if (!window.speechSynthesis) {
      setError("Speech synthesis is not available. Please try a different browser.")
      setState("error")
      return
    }

    // Cancel any ongoing speech
    if (currentUtteranceRef.current) {
      window.speechSynthesis.cancel()
    }

    setState("speaking")
    setIsSpeaking(true)

    const utterance = new SpeechSynthesisUtterance(text)
    
    // Try to use a natural-sounding voice
    const voices = window.speechSynthesis.getVoices()
    const preferredVoice = voices.find(
      voice => voice.name.includes("Google") ||
               voice.name.includes("Natural") ||
               voice.name.includes("Premium") ||
               voice.name.includes("Enhanced")
    ) || voices.find(voice => voice.lang.startsWith("en") && voice.localService === false) || voices.find(voice => voice.lang.startsWith("en"))

    if (preferredVoice) {
      utterance.voice = preferredVoice
    }

    utterance.rate = 0.95
    utterance.pitch = 1.0
    utterance.volume = 1.0

    utterance.onstart = () => {
      setIsSpeaking(true)
      setState("speaking")
    }

    utterance.onend = () => {
      setIsSpeaking(false)
      if (onEnd) onEnd()
      if (state !== "error" && !isMuted) {
        // Reset processing flag when speech ends
        isProcessingRef.current = false
        setState("listening")
        // Start listening after speech ends
        setTimeout(() => {
          if (useWebRecognitionFallback.current) {
            // Initialize recognition if not already initialized
            if (!recognitionRef.current) {
              const recognition = initWebSpeechRecognition()
              if (recognition) {
                recognitionRef.current = recognition
              }
            }
            // Start recognition only if not already running
            if (recognitionRef.current) {
              // Check if recognition is already running by checking its state
              // Check if recognition is running (state property may not be available in all browsers)
              let isRunning = false
              try {
                const recognition = recognitionRef.current as SpeechRecognition & { state?: string }
                isRunning = recognition.state === "listening" || recognition.state === "starting"
              } catch {
                // State property not available, assume not running
              }
              
              if (!isRunning) {
                try {
                  recognitionRef.current.start()
                  console.log("Recognition started after speech ended")
                } catch (e: unknown) {
                  // If already started, that's okay - just log it
                  if (e instanceof Error && (e.name === "InvalidStateError" || e.message?.includes("already started"))) {
                    console.log("Recognition already running, continuing...")
                  } else {
                    console.warn("Recognition start error:", e)
                  }
                }
              } else {
                console.log("Recognition already running, skipping start")
              }
            }
          } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
            mediaRecorderRef.current.start()
          }
        }, 800) // Increased delay to ensure speech has fully ended and recognition can start cleanly
      }
    }

    utterance.onerror = (event) => {
      setIsSpeaking(false)
      console.warn("Web Speech synthesis error (non-critical):", event)
      // Most errors are non-critical, continue the flow
      if (onEnd) onEnd()
      if (state !== "error" && !isMuted) {
        setState("listening")
        // Use refs to avoid circular dependency
        setTimeout(() => {
          if (useWebRecognitionFallback.current && recognitionRef.current) {
            try {
              recognitionRef.current.start()
            } catch (e) {
              // Already started or error
            }
          } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
            mediaRecorderRef.current.start()
          }
        }, 300)
      }
    }

    currentUtteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [state, isMuted])

  // Initialize Web Speech Recognition (fallback when OpenAI fails)
  const initWebSpeechRecognition = useCallback(() => {
    if (typeof window === "undefined") return null

    const SpeechRecognition = 
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition || 
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition

    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.")
      return null
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = true
    recognition.interimResults = true // Enable interim results for better feedback
    recognition.lang = "en-US"
    recognition.maxAlternatives = 1
    // Note: serviceURI and grammars are not widely supported, so we don't set them

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      // Skip if we're already processing a previous result
      if (isProcessingRef.current) {
        return
      }

      // Get all results
      const results = Array.from(event.results)
      
      // Log interim results for debugging
      const interimTranscripts = results
        .filter(r => !r.isFinal)
        .map(r => r[0].transcript)
        .join(" ")
      
      if (interimTranscripts) {
        console.log("Interim transcript (listening...):", interimTranscripts)
      }
      
      // Get the final transcript (last result is usually the final one)
      const finalResults = results.filter(r => r.isFinal)
      
      // Only process if we have final results
      if (finalResults.length === 0) {
        return
      }
      
      const finalResult = finalResults[finalResults.length - 1]
      const transcript = finalResult[0].transcript.trim()

      // Only process if we have a meaningful transcript (at least 2 characters)
      // Reduced from 3 to 2 to catch shorter responses
      if (transcript.length < 2) {
        console.log("Transcript too short, ignoring:", transcript)
        // Continue listening
        return
      }

      console.log("Final transcript detected:", transcript)

      // Mark as processing to prevent duplicate handling
      isProcessingRef.current = true
      
      // Stop recognition while processing to avoid duplicate detections
      try {
        recognition.stop()
      } catch (e) {
        // Ignore if already stopped
      }
      
      // Add a small delay to ensure user has finished speaking
      // This helps capture complete sentences
      await new Promise(resolve => setTimeout(resolve, 200))

      // Process the transcript
      const userMessage: VoiceInterviewMessage = {
        role: "user",
        text: transcript,
        timestamp: new Date(),
      }

      setMessages((prev) => {
        const updated = [...prev, userMessage]
        messagesRef.current = updated
        onMessage?.(userMessage)
        return updated
      })

      setState("processing")

      // Generate AI response
      try {
          const conversationHistory = [
            ...messagesRef.current.map((m) => ({
              role: m.role,
              content: m.text,
              timestamp: m.timestamp,
            })),
            { role: "user" as const, content: transcript, timestamp: new Date() },
          ]

          const response = await fetch("/api/ai/interview/response", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messages: conversationHistory.map((msg) => ({
                role: msg.role,
                content: msg.content,
                timestamp: msg.timestamp.toISOString(),
              })),
              jobInfo,
              userName,
            }),
          })

          if (!response.ok) {
            let errorMessage = `Failed to generate response: ${response.statusText}`
            try {
              const errorData = await response.json()
              errorMessage = errorData.error || errorMessage
            } catch {
              // If response is not JSON, use statusText
            }
            throw new Error(errorMessage)
          }

          const data = await response.json()
          if (data.error) {
            throw new Error(data.error)
          }
          if (!data.response) {
            throw new Error("Invalid response format from server")
          }

          const aiResponse = data.response

          const assistantMessage: VoiceInterviewMessage = {
            role: "assistant",
            text: aiResponse,
            timestamp: new Date(),
          }

          setMessages((prev) => {
            const updated = [...prev, assistantMessage]
            messagesRef.current = updated
            onMessage?.(assistantMessage)
            return updated
          })

          // Speak the response
          await speak(aiResponse)
          
          // Reset processing flag after speaking starts
          isProcessingRef.current = false
        } catch (err: unknown) {
          console.error("AI response generation error:", err)
          setError(`Error: ${err instanceof Error ? err.message : "Unknown error"}`)
          setState("error")
          isProcessingRef.current = false
        }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorType = event.error || "unknown"
      console.log("Speech recognition error type:", errorType)
      
      if (errorType === "not-allowed") {
        setError("Microphone permission denied. Please allow microphone access.")
        setState("error")
      } else if (errorType === "network") {
        // Network errors are often transient - retry automatically
        console.warn("Network error, retrying recognition...")
        if (state === "listening" && !isMuted && !isProcessingRef.current) {
          setTimeout(() => {
            if (recognitionRef.current) {
              let isRunning = false
              try {
                const recognition = recognitionRef.current as SpeechRecognition & { state?: string }
                isRunning = recognition.state === "listening" || recognition.state === "starting"
              } catch {
                // State property not available, assume not running
              }
              
              if (!isRunning) {
                try {
                  recognitionRef.current.start()
                } catch (e: unknown) {
                  if (e instanceof Error && e.name !== "InvalidStateError" && !e.message?.includes("already started")) {
                    console.warn("Network retry error:", e)
                  }
                }
              }
            }
          }, 1000)
        }
      } else if (errorType === "no-speech") {
        // No speech detected - this is normal, just restart listening
        console.log("No speech detected, continuing to listen...")
        if (state === "listening" && !isMuted) {
          setTimeout(() => {
            if (recognitionRef.current) {
              try {
                recognitionRef.current.start()
              } catch (e) {
                // Already started
              }
            }
          }, 500)
        }
      } else if (errorType === "aborted") {
        // Aborted is normal when we stop it manually - ignore
        return
      } else if (errorType === "service-not-allowed") {
        setError("Speech recognition service is not available. Please try a different browser.")
        setState("error")
      } else {
        // Other errors - log but try to continue
        console.warn("Speech recognition error (non-critical):", errorType)
        if (state === "listening" && !isMuted && !isProcessingRef.current && errorType !== "audio-capture") {
          setTimeout(() => {
            if (recognitionRef.current) {
              let isRunning = false
              try {
                const recognition = recognitionRef.current as SpeechRecognition & { state?: string }
                isRunning = recognition.state === "listening" || recognition.state === "starting"
              } catch {
                // State property not available, assume not running
              }
              
              if (!isRunning) {
                try {
                  recognitionRef.current.start()
                } catch (e: unknown) {
                  if (e instanceof Error && e.name !== "InvalidStateError" && !e.message?.includes("already started")) {
                    console.warn("Recognition restart error:", e)
                  }
                }
              }
            }
          }, 1000)
        }
      }
    }

    recognition.onend = () => {
      // Auto-restart if we're still in listening state and not processing
      // This ensures continuous listening
      if (state === "listening" && !isMuted && !isProcessingRef.current) {
        setTimeout(() => {
          if (recognitionRef.current && state === "listening" && !isProcessingRef.current) {
            // Check if recognition is already running
            let isRunning = false
            try {
              const recognition = recognitionRef.current as SpeechRecognition & { state?: string }
              isRunning = recognition.state === "listening" || recognition.state === "starting"
            } catch {
              // State property not available, assume not running
            }
            
            if (!isRunning) {
              try {
                recognitionRef.current.start()
                // Silent restart - no logging to reduce noise
              } catch (e: unknown) {
                // If already started, that's okay - silently continue
                if (e instanceof Error && e.name !== "InvalidStateError" && !e.message?.includes("already started")) {
                  // Only log unexpected errors
                  console.warn("Recognition restart error:", e)
                }
              }
            }
          }
        }, 100) // Very short delay for responsive listening
      }
    }

    return recognition
  }, [state, isMuted, messagesRef, onMessage, jobInfo, userName, speak])

  // Start recording audio
  const startRecording = useCallback(async () => {
    if (isMuted || state === "speaking") return

    // If using Web Speech Recognition fallback, use that instead
    if (useWebRecognitionFallback.current) {
      // Initialize recognition if not already initialized
      if (!recognitionRef.current) {
        const recognition = initWebSpeechRecognition()
        if (recognition) {
          recognitionRef.current = recognition
        }
      }
      
      // Start recognition only if not already running
      if (recognitionRef.current) {
        let isRunning = false
        try {
          const recognition = recognitionRef.current as SpeechRecognition & { state?: string }
          isRunning = recognition.state === "listening" || recognition.state === "starting"
        } catch {
          // State property not available, assume not running
        }
        
        if (!isRunning) {
          try {
            setState("listening")
            recognitionRef.current.start()
            console.log("Recognition started via startRecording")
          } catch (e: unknown) {
            if (e instanceof Error && (e.name === "InvalidStateError" || e.message?.includes("already started"))) {
              console.log("Recognition already running")
            } else {
              console.error("Failed to start recognition:", e)
            }
          }
        } else {
          console.log("Recognition already running, skipping start")
        }
      }
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4",
      })

      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop())

        // Process recorded audio
        if (audioChunksRef.current.length > 0) {
          const audioBlob = new Blob(audioChunksRef.current, {
            type: mediaRecorder.mimeType,
          })

          // Transcribe audio - call transcribeAndProcess directly
          // It will be defined by the time this callback executes
          setState("processing")
          
          // Transcribe audio using Whisper
          const formData = new FormData()
          formData.append("audio", audioBlob, "recording.webm")

          try {
            const transcribeResponse = await fetch("/api/voice/transcribe", {
              method: "POST",
              body: formData,
            })

            if (!transcribeResponse.ok) {
              let errorMessage = "Failed to transcribe audio"
              try {
                const errorData = await transcribeResponse.json()
                errorMessage = errorData.error || errorMessage
              } catch {
                errorMessage = `Failed to transcribe audio: ${transcribeResponse.statusText}`
              }
              
              console.error("Transcription API error:", {
                status: transcribeResponse.status,
                statusText: transcribeResponse.statusText,
                error: errorMessage,
              })
              
              // If quota exceeded or API key issues, switch to Web Speech Recognition fallback
              if (errorMessage.includes("quota") || errorMessage.includes("api key") || errorMessage.includes("authentication")) {
                console.warn("OpenAI Whisper unavailable, switching to Web Speech Recognition")
                useWebRecognitionFallback.current = true
                // Stop MediaRecorder and switch to Web Speech Recognition
                if (recognitionRef.current) {
                  recognitionRef.current.stop()
                }
                const recognition = initWebSpeechRecognition()
                if (recognition) {
                  recognitionRef.current = recognition
                  setState("listening")
                  recognition.start()
                }
                return
              }
              
              throw new Error(errorMessage)
            }

            const { text: transcript } = await transcribeResponse.json()

            if (!transcript || transcript.trim().length === 0) {
              // No speech detected, resume listening
              if (state !== "error" && !isMuted) {
                setState("listening")
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
                  mediaRecorderRef.current.start()
                }
              }
              return
            }

            // Add user message
            const userMessage: VoiceInterviewMessage = {
              role: "user",
              text: transcript,
              timestamp: new Date(),
            }

            setMessages((prev) => {
              const updated = [...prev, userMessage]
              messagesRef.current = updated
              onMessage?.(userMessage)
              return updated
            })

            // Generate AI response
            const conversationHistory = [
              ...messagesRef.current.map((m) => ({
                role: m.role,
                content: m.text,
                timestamp: m.timestamp,
              })),
              { role: "user" as const, content: transcript, timestamp: new Date() },
            ]

            const response = await fetch("/api/ai/interview/response", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messages: conversationHistory.map((msg) => ({
                  role: msg.role,
                  content: msg.content,
                  timestamp: msg.timestamp.toISOString(),
                })),
                jobInfo,
                userName,
              }),
            })

            if (!response.ok) {
              let errorMessage = `Failed to generate response: ${response.statusText}`
              try {
                const errorData = await response.json()
                errorMessage = errorData.error || errorMessage
              } catch {
                // If response is not JSON, use statusText
              }
              throw new Error(errorMessage)
            }

            const data = await response.json()
            if (data.error) {
              throw new Error(data.error)
            }
            if (!data.response) {
              throw new Error("Invalid response format from server")
            }

            const aiResponse = data.response

            // Add assistant message
            const assistantMessage: VoiceInterviewMessage = {
              role: "assistant",
              text: aiResponse,
              timestamp: new Date(),
            }

            setMessages((prev) => {
              const updated = [...prev, assistantMessage]
              messagesRef.current = updated
              onMessage?.(assistantMessage)
              return updated
            })

            // Speak the response
            await speak(aiResponse)
          } catch (err: unknown) {
            console.error("Processing error:", err)
            setError(`Error: ${err instanceof Error ? err.message : "Unknown error"}`)
            setState("error")
          }
        }

        audioChunksRef.current = []
      }

      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setState("listening")
    } catch (err: unknown) {
      console.error("Recording error:", err)
      setError("Failed to access microphone. Please allow microphone access.")
      setState("error")
    }
  }, [isMuted, state, useWebRecognitionFallback, initWebSpeechRecognition])

  // Stop recording
  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop()
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
  }, [])

  // Start the interview
  const start = useCallback(async () => {
    try {
      setState("connecting")
      setError(null)
      setMessages([])
      setCallDuration(0)
      startTimeRef.current = new Date()

      // Request microphone permission
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch (err) {
        setError("Microphone access denied. Please allow microphone access and try again.")
        setState("error")
        return
      }

      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000)
          setCallDuration(elapsed)
        }
      }, 1000)

      setState("connected")

      // Generate and speak initial greeting
      try {
        const response = await fetch("/api/ai/interview/response", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [],
            jobInfo,
            userName,
          }),
        })

        if (!response.ok) {
          let errorMessage = `Failed to generate initial response: ${response.statusText}`
          try {
            const errorData = await response.json()
            errorMessage = errorData.error || errorMessage
          } catch {
            // If response is not JSON, use statusText
          }
          throw new Error(errorMessage)
        }

        const data = await response.json()
        if (data.error) {
          throw new Error(data.error)
        }
        if (!data.response) {
          throw new Error("Invalid response format from server")
        }

        const initialResponse = data.response

        const assistantMessage: VoiceInterviewMessage = {
          role: "assistant",
          text: initialResponse,
          timestamp: new Date(),
        }

        setMessages([assistantMessage])
        messagesRef.current = [assistantMessage]
        onMessage?.(assistantMessage)

        // Speak the initial greeting, then start listening
        await speak(initialResponse, () => {
          // After initial greeting is spoken, start listening for user response
          if (!isMuted && state !== "error") {
            setTimeout(() => {
              if (useWebRecognitionFallback.current) {
                // Initialize recognition if not already initialized
                if (!recognitionRef.current) {
                  const recognition = initWebSpeechRecognition()
                  if (recognition) {
                    recognitionRef.current = recognition
                  }
                }
                // Start recognition
                if (recognitionRef.current) {
                  try {
                    setState("listening")
                    recognitionRef.current.start()
                  } catch (e) {
                    console.warn("Failed to start recognition after initial greeting:", e)
                    // Retry after a short delay
                    setTimeout(() => {
                      if (recognitionRef.current) {
                        try {
                          setState("listening")
                          recognitionRef.current.start()
                        } catch (e2) {
                          console.error("Failed to start recognition on retry:", e2)
                        }
                      }
                    }, 1000)
                  }
                }
              } else {
                // Use MediaRecorder approach
                startRecording()
              }
            }, 500)
          }
        })
      } catch (err: unknown) {
        console.error("Error generating initial response:", err)
        setError(`Initial response error: ${err instanceof Error ? err.message : "Unknown error"}`)
        setState("error")
      }
    } catch (err: unknown) {
      console.error("Start error:", err)
      setError(`Failed to start interview: ${err instanceof Error ? err.message : "Unknown error"}`)
      setState("error")
    }
  }, [jobInfo, userName, onMessage, speak])

  // Stop the interview
  const stop = useCallback(() => {
    stopRecording()
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ""
    }
    if (currentUtteranceRef.current && typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel()
      currentUtteranceRef.current = null
    }
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setState("idle")
  }, [stopRecording])

  // Toggle mute
  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const newMuted = !prev
      if (newMuted) {
        stopRecording()
      } else if (state === "connected" || state === "listening") {
        startRecording()
      }
      return newMuted
    })
  }, [state, stopRecording, startRecording])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop()
    }
  }, [stop])

  return {
    state,
    messages,
    error,
    callDuration,
    isMuted,
    isSpeaking,
    start,
    stop,
    toggleMute,
  }
}

