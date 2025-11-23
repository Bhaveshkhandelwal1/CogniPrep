"use client"

import { useEffect, useRef, useState, useCallback } from "react"

export type VoiceInterviewState = "idle" | "connecting" | "connected" | "speaking" | "listening" | "processing" | "error"

export interface VoiceInterviewMessage {
  role: "user" | "assistant"
  text: string
  timestamp: Date
}

interface UseFreeVoiceInterviewProps {
  jobInfo: {
    title?: string | null
    description: string
    experienceLevel: string
  }
  userName: string
  onMessage?: (message: VoiceInterviewMessage) => void
}

export function useFreeVoiceInterview({
  jobInfo,
  userName,
  onMessage,
}: UseFreeVoiceInterviewProps) {
  const [state, setState] = useState<VoiceInterviewState>("idle")
  const [messages, setMessages] = useState<VoiceInterviewMessage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [callDuration, setCallDuration] = useState(0)

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const startTimeRef = useRef<Date | null>(null)

  // Initialize speech recognition
  const initSpeechRecognition = useCallback(() => {
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
    recognition.interimResults = false
    recognition.lang = "en-US"

    recognition.onresult = async (event: SpeechRecognitionEvent) => {
      const transcript = Array.from(event.results)
        .map(result => result[0].transcript)
        .join(" ")
        .trim()

      if (transcript) {
        const userMessage: VoiceInterviewMessage = {
          role: "user",
          text: transcript,
          timestamp: new Date(),
        }
        
        setMessages(prev => {
          const updated = [...prev, userMessage]
          onMessage?.(userMessage)
          return updated
        })
        
        setState("processing")
        
        // Generate AI response
        try {
          const conversationHistory = [
            ...messages.map(m => ({ role: m.role, content: m.text, timestamp: m.timestamp })),
            { role: "user" as const, content: transcript, timestamp: new Date() },
          ]
          
          const response = await fetch("/api/ai/interview/response", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messages: conversationHistory.map(msg => ({
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

          setMessages(prev => {
            const updated = [...prev, assistantMessage]
            onMessage?.(assistantMessage)
            return updated
          })

          // Speak the AI response
          speak(aiResponse)
        } catch (err) {
          console.error("Failed to generate AI response:", err)
          setError("Failed to generate response. Please try again.")
          setState("listening")
          if (recognitionRef.current && !isMuted) {
            try {
              recognitionRef.current.start()
            } catch {
              // Already started
            }
          }
        }
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const errorType = event.error || "unknown"
      console.error("Speech recognition error:", {
        error: errorType,
        message: event.message,
        event: event,
      })

      if (errorType === "no-speech") {
        // User stopped speaking, resume listening
        if (state === "listening" && !isMuted) {
          setTimeout(() => {
            if (recognitionRef.current && state === "listening") {
              try {
                recognitionRef.current.start()
              } catch {
                // Already started or other error - ignore
              }
            }
          }, 500)
        }
      } else if (errorType === "not-allowed") {
        setError("Microphone permission denied. Please allow microphone access.")
        setState("error")
      } else if (errorType === "network") {
        // Network errors are often transient - retry automatically
        console.warn("Network error in speech recognition, retrying...")
        if (state === "listening" && !isMuted) {
          setTimeout(() => {
            if (recognitionRef.current && state === "listening") {
              try {
                recognitionRef.current.start()
              } catch {
                // If retry fails, show error
                setError("Network connection issue. Please check your internet connection and try again.")
                setState("error")
              }
            }
          }, 1000)
        }
      } else if (errorType === "aborted") {
        // Aborted is normal when we stop it manually - ignore
        return
      } else {
        // Other errors - log but don't break the flow unless critical
        console.warn("Speech recognition error (non-critical):", errorType)
        // Try to resume listening if we're still in listening state
        if (state === "listening" && !isMuted && errorType !== "service-not-allowed") {
          setTimeout(() => {
            if (recognitionRef.current && state === "listening") {
              try {
                recognitionRef.current.start()
              } catch {
                // Ignore restart errors
              }
            }
          }, 500)
        } else if (errorType === "service-not-allowed") {
          setError("Speech recognition service is not available. Please try a different browser.")
          setState("error")
        }
      }
    }

    recognition.onend = () => {
      // Auto-restart if we're still in listening state
      if (state === "listening" && !isMuted) {
        setTimeout(() => {
          if (recognitionRef.current) {
            try {
              recognitionRef.current.start()
            } catch {
              // Already started or error
            }
          }
        }, 100)
      }
    }

    return recognition
    // Note: speak is intentionally excluded to avoid circular dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, isMuted, messages, jobInfo, userName, onMessage])

  // Speak text using Web Speech API
  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setError("Speech synthesis is not supported in this browser.")
      setState("error")
      return
    }

    // Check if speech synthesis is actually available
    if (!window.speechSynthesis) {
      setError("Speech synthesis is not available. Please try a different browser.")
      setState("error")
      return
    }

    // Cancel any ongoing speech
    if (currentUtteranceRef.current) {
      window.speechSynthesis.cancel()
    }

    // Wait for voices to be available if they're not loaded yet
    const getVoices = (): SpeechSynthesisVoice[] => {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length === 0) {
        // Voices might not be loaded yet, wait a bit
        console.warn("No voices available yet, waiting...")
        return []
      }
      return voices
    }

    const voices = getVoices()
    
    // If no voices available, wait for them to load
    if (voices.length === 0) {
      let retryCount = 0
      const maxRetries = 10 // Wait up to 1 second for voices
      const waitForVoices = () => {
        const updatedVoices = window.speechSynthesis.getVoices()
        if (updatedVoices.length > 0) {
          // Voices loaded, create utterance and speak
          const utterance = new SpeechSynthesisUtterance(text)
          utterance.rate = 0.95
          utterance.pitch = 1.0
          utterance.volume = 1.0
          
          const preferredVoice = updatedVoices.find(
            voice => voice.name.includes("Google") || 
                     voice.name.includes("Natural") ||
                     voice.name.includes("Premium") ||
                     voice.name.includes("Enhanced")
          ) || updatedVoices.find(voice => voice.lang.startsWith("en") && voice.localService === false) || updatedVoices.find(voice => voice.lang.startsWith("en"))
          
          if (preferredVoice) {
            try {
              utterance.voice = preferredVoice
            } catch {
              // Ignore
            }
          }
          
          utterance.onstart = () => {
            setIsSpeaking(true)
            setState("speaking")
          }
          
          utterance.onend = () => {
            setIsSpeaking(false)
            if (onEnd) onEnd()
            if (state !== "error" && !isMuted) {
              setState("listening")
              if (recognitionRef.current) {
                setTimeout(() => {
                  if (recognitionRef.current) {
                    try {
                      recognitionRef.current.start()
                    } catch {
                      // Already started
                    }
                  }
                }, 300)
              }
            }
          }
          
          utterance.onerror = (event: Event) => {
            setIsSpeaking(false)
            const synthEvent = event as SpeechSynthesisErrorEvent
            const errorType = synthEvent?.error || null
            if (errorType === "synthesis-failed" || errorType === "synthesis-unavailable") {
              setError("Text-to-speech is not available in this browser. Please try Chrome, Edge, or Safari.")
              setState("error")
            }
          }
          
          currentUtteranceRef.current = utterance
          window.speechSynthesis.speak(utterance)
        } else if (retryCount < maxRetries) {
          retryCount++
          setTimeout(waitForVoices, 100)
        } else {
          // Give up after max retries
          setError("Speech synthesis voices failed to load. Please refresh the page.")
          setState("error")
        }
      }
      window.speechSynthesis.addEventListener("voiceschanged", waitForVoices, { once: true })
      setTimeout(waitForVoices, 100)
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    
    // Configure voice (try to use a natural-sounding voice, but don't require it)
    const preferredVoice = voices.find(
      voice => voice.name.includes("Google") || 
               voice.name.includes("Natural") ||
               voice.name.includes("Premium") ||
               voice.name.includes("Enhanced")
    ) || voices.find(voice => voice.lang.startsWith("en") && voice.localService === false) || voices.find(voice => voice.lang.startsWith("en"))
    
    // Only set voice if we found one (some browsers work better without specifying)
    if (preferredVoice) {
      try {
        utterance.voice = preferredVoice
      } catch (e: unknown) {
        console.warn("Could not set preferred voice, using default:", e)
        // Continue without setting voice - browser will use default
      }
    }
    
    utterance.rate = 0.95 // Slightly slower for clarity
    utterance.pitch = 1.0
    utterance.volume = 1.0

    utterance.onstart = () => {
      setIsSpeaking(true)
      setState("speaking")
    }

    utterance.onend = () => {
      setIsSpeaking(false)
      if (onEnd) {
        onEnd()
      }
      // Resume listening after speaking
      if (state !== "error" && !isMuted) {
        setState("listening")
        if (recognitionRef.current) {
          setTimeout(() => {
            if (recognitionRef.current) {
              try {
                recognitionRef.current.start()
              } catch {
                // Already started
              }
            }
          }, 300)
        }
      }
    }

    utterance.onerror = (event: Event) => {
      // Try to extract error information safely
      const synthEvent = event as SpeechSynthesisErrorEvent
      let errorType: string | null = null
      
      // Try to get the error type
      try {
        errorType = synthEvent?.error || null
      } catch {
        // Ignore extraction errors
      }
      
      setIsSpeaking(false)
      
      // Only handle errors if we have a specific error type
      // Most browsers fire error events without details for non-critical issues
      if (errorType) {
        if (errorType === "synthesis-failed" || errorType === "synthesis-unavailable") {
          console.error("Speech synthesis failed - text-to-speech unavailable")
          
          // Try to retry without specifying a voice (some browsers have issues with specific voices)
          if (utterance.voice) {
            console.warn("Retrying without specific voice...")
            const retryUtterance = new SpeechSynthesisUtterance(text)
            retryUtterance.rate = 0.95
            retryUtterance.pitch = 1.0
            retryUtterance.volume = 1.0
            
            retryUtterance.onerror = () => {
              // If retry also fails, show error
              setError("Text-to-speech is not available in this browser. Please try Chrome, Edge, or Safari.")
              setState("error")
            }
            
            retryUtterance.onend = () => {
              setIsSpeaking(false)
              if (onEnd) onEnd()
              if (state !== "error" && !isMuted) {
                setState("listening")
                if (recognitionRef.current) {
                  setTimeout(() => {
                    if (recognitionRef.current) {
                      try {
                        recognitionRef.current.start()
                      } catch {
                        // Already started
                      }
                    }
                  }, 300)
                }
              }
            }
            
            currentUtteranceRef.current = retryUtterance
            try {
              window.speechSynthesis.speak(retryUtterance)
              return // Don't show error yet, wait for retry
            } catch (e) {
              console.error("Retry failed:", e)
            }
          }
          
          // If no voice was set or retry failed, show error
          setError("Text-to-speech is not available in this browser. Please try Chrome, Edge, or Safari.")
          setState("error")
          return
        } else if (errorType === "audio-busy") {
          // Audio system is busy - retry after a short delay
          console.warn("Audio system busy, retrying speech...")
          setTimeout(() => {
            if (currentUtteranceRef.current) {
              try {
                window.speechSynthesis.speak(currentUtteranceRef.current)
              } catch (e) {
                console.error("Speech retry failed:", e)
                setError("Failed to speak. Please try again.")
                setState("error")
              }
            }
          }, 500)
          return
        } else {
          // Other known error types - log but continue
          console.warn("Speech synthesis error (non-critical):", errorType)
        }
      }
      
      // For unknown errors or events without error types:
      // These are often non-critical browser warnings (voice changes, audio context updates, etc.)
      // The speech usually still works, so we just continue the flow
      // Don't log these as they clutter the console without providing useful information
      
      // Resume listening even on error (most are non-critical)
      if (state !== "error" && !isMuted) {
        setState("listening")
        if (recognitionRef.current) {
          setTimeout(() => {
            if (recognitionRef.current) {
              try {
                recognitionRef.current.start()
              } catch {
                // Already started
              }
            }
          }, 300)
        }
      }
    }

    currentUtteranceRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }, [state, isMuted])

  // Start the interview
  const start = useCallback(async () => {
    try {
      setState("connecting")
      setError(null)

      // Request microphone permission
      try {
        await navigator.mediaDevices.getUserMedia({ audio: true })
      } catch {
        setError("Microphone access denied. Please allow microphone access and try again.")
        setState("error")
        return
      }

      // Initialize speech recognition
      const recognition = initSpeechRecognition()
      if (!recognition) {
        return
      }

      recognitionRef.current = recognition

      // Load voices (some browsers need this)
      if (window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.addEventListener("voiceschanged", () => {
          // Voices loaded
        }, { once: true })
      }

      setState("connected")
      startTimeRef.current = new Date()
      
      // Start duration timer
      durationIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current.getTime()) / 1000)
          setCallDuration(elapsed)
        }
      }, 1000)
      
      // Generate and speak initial greeting/question
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
        onMessage?.(assistantMessage)

        // Speak the initial question
        speak(initialResponse, () => {
          // After speaking, start listening
          setState("listening")
          if (recognitionRef.current) {
            recognitionRef.current.start()
          }
        })
      } catch (err) {
        console.error("Failed to generate initial response:", err)
        setError("Failed to start interview. Please try again.")
        setState("error")
      }
    } catch (err) {
      console.error("Failed to start interview:", err)
      setError(err instanceof Error ? err.message : "Failed to start interview")
      setState("error")
    }
  }, [initSpeechRecognition, jobInfo, userName, speak, onMessage])

  // Stop the interview
  const stop = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    
    if (window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
    
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }
    
    currentUtteranceRef.current = null
    startTimeRef.current = null
    setState("idle")
    setIsSpeaking(false)
  }, [])

  // Mute/unmute
  const mute = useCallback(() => {
    setIsMuted(true)
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
  }, [])

  const unmute = useCallback(() => {
    setIsMuted(false)
    if (recognitionRef.current && state === "connected") {
      setState("listening")
      setTimeout(() => {
        if (recognitionRef.current) {
          try {
            recognitionRef.current.start()
          } catch {
            // Already started
          }
        }
      }, 100)
    }
  }, [state])

  // Format duration as MM:SS
  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop()
      }
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel()
      }
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current)
      }
    }
  }, [])

  return {
    state,
    messages,
    error,
    isMuted,
    isSpeaking,
    callDuration: formatDuration(callDuration),
    start,
    stop,
    speak,
    mute,
    unmute,
  }
}
