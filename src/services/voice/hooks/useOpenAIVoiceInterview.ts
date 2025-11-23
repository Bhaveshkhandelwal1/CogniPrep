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
  const useWebSpeechFallback = useRef(true) // Always use Web Speech API (free, unlimited)
  const useWebRecognitionFallback = useRef(true) // Always use Web Speech Recognition (free, unlimited)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const isProcessingRef = useRef(false) // Track if we're processing to avoid duplicate detections
  const accumulatedTranscriptRef = useRef("") // Accumulate complete speech
  const lastFinalIndexRef = useRef(-1) // Track last processed result index
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null) // Timeout for silence detection
  
  // Detect mobile device for mobile-specific handling
  const isMobileDevice = useRef(false)
  if (typeof window !== "undefined" && !isMobileDevice.current) {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera
    isMobileDevice.current = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase())
    if (isMobileDevice.current) {
      console.log("📱 Mobile device detected - using mobile-optimized settings")
    }
  }

  // Update messagesRef whenever messages state changes
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Speak text using Web Speech API (free, unlimited) - always use Web Speech API
  const speak = useCallback(async (text: string, onEnd?: () => void) => {
    if (!text) {
      console.warn("speak() called with empty text")
      return
    }

    // Always use Web Speech API (completely free, no API keys, no limits)
    // This ensures the interview always works without quota issues
    console.log("Speaking with Web Speech API:", text.substring(0, 50) + "...")
    return speakWithWebSpeech(text, onEnd)

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
                } catch {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // speakWithWebSpeech is defined later, but it's stable (useCallback)
  }, [state, isMuted])

  // Fallback: Speak using Web Speech API (completely free, no API limits)
  // Helper function to wait for voices to load
  const waitForVoices = useCallback((): Promise<SpeechSynthesisVoice[]> => {
    return new Promise((resolve) => {
      const voices = window.speechSynthesis.getVoices()
      if (voices.length > 0) {
        resolve(voices)
        return
      }

      // Wait for voices to load
      const onVoicesChanged = () => {
        const loadedVoices = window.speechSynthesis.getVoices()
        if (loadedVoices.length > 0) {
          window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged)
          resolve(loadedVoices)
        }
      }

      window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged)
      
      // Fallback timeout - use default voices if none load after 2 seconds
      setTimeout(() => {
        window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged)
        const fallbackVoices = window.speechSynthesis.getVoices()
        resolve(fallbackVoices)
      }, 2000)
    })
  }, [])

  const speakWithWebSpeech = useCallback(async (text: string, onEnd?: () => void) => {
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

    try {
      // Wait for voices to be loaded (critical for Vercel/production)
      const voices = await waitForVoices()
      
      const utterance = new SpeechSynthesisUtterance(text)
      
      // Try to use a natural-sounding voice
      const preferredVoice = voices.find(
        voice => voice.name.includes("Google") ||
                 voice.name.includes("Natural") ||
                 voice.name.includes("Premium") ||
                 voice.name.includes("Enhanced")
      ) || voices.find(voice => voice.lang.startsWith("en") && voice.localService === false) || voices.find(voice => voice.lang.startsWith("en"))

      if (preferredVoice) {
        utterance.voice = preferredVoice
        console.log("Using voice:", preferredVoice.name, preferredVoice.lang)
      } else if (voices.length > 0) {
        // Use first available voice if no preferred voice found
        utterance.voice = voices[0]
        console.log("Using fallback voice:", voices[0].name, voices[0].lang)
      } else {
        console.warn("No voices available, using default")
      }

      // Optimized voice settings for natural conversation
      utterance.rate = 1.0 // Slightly faster for more natural pace
      utterance.pitch = 1.0
      utterance.volume = 1.0
      utterance.lang = "en-US" // Explicitly set language

      utterance.onstart = (event) => {
        console.log("Speech started event fired", event)
        setIsSpeaking(true)
        setState("speaking")
      }
      
      // Handle speech boundaries - also prepare recognition near end
      utterance.onboundary = (event) => {
        // Update state if needed
        if (!isSpeaking) {
          console.log("Speech boundary detected, updating state")
          setIsSpeaking(true)
          setState("speaking")
        }
        
        // Pre-start recognition slightly before speech ends for ultra-smooth transition
        if (event.charIndex > 0 && utterance.text && event.charIndex > utterance.text.length * 0.8) {
          // We're 80% through the speech - prepare recognition
          if (!isMuted && state !== "error" && !recognitionRef.current) {
            const recognition = initWebSpeechRecognition()
            if (recognition) {
              recognitionRef.current = recognition
              console.log("Pre-initialized recognition near end of speech")
            }
          }
        }
      }

      utterance.onend = () => {
        console.log("✓ Speech ended event fired")
        setIsSpeaking(false)
        
        // Call onEnd callback first
        if (onEnd) {
          try {
            onEnd()
          } catch (callbackError) {
            console.error("Error in onEnd callback:", callbackError)
          }
        }
        
        // Start listening after speech ends
        // Use a small delay to ensure speech synthesis has fully completed
        // On mobile, use shorter delay for faster response
        const startDelay = isMobileDevice.current ? 100 : 200
        
        setTimeout(() => {
          // Check current state (not closure state) to avoid stale values
          setState(currentState => {
            // Only start listening if we're not in error state and not muted
            if (currentState === "error" || isMuted) {
              console.log("Skipping recognition start - state:", currentState, "muted:", isMuted)
              return currentState
            }
            
            // Reset processing flag when speech ends
            isProcessingRef.current = false
            
            // Start listening immediately after speech ends
            const startListening = () => {
              console.log("🎤 Starting recognition after speech ended...")
              
              if (useWebRecognitionFallback.current) {
                // Ensure recognition is initialized
                if (!recognitionRef.current) {
                  console.log("Initializing recognition in onend...")
                  const recognition = initWebSpeechRecognition()
                  if (recognition) {
                    recognitionRef.current = recognition
                    console.log("✓ Recognition initialized in onend")
                  } else {
                    console.error("✗ Failed to initialize recognition in onend")
                    setError("Speech recognition is not available. Please use Chrome, Edge, or Safari.")
                    setState("error")
                    return
                  }
                }
                
                // Start recognition with retry logic for production
                // On mobile, use more attempts and shorter delays
                if (recognitionRef.current) {
                  const maxAttempts = isMobileDevice.current ? 5 : 3
                  const verifyDelay = isMobileDevice.current ? 200 : 300
                  const retryDelay = isMobileDevice.current ? 100 : 200
                  const reinitDelay = isMobileDevice.current ? 300 : 500
                  
                  const attemptStart = (attempt = 1) => {
                    try {
                      console.log(`📱 Starting recognition (attempt ${attempt}/${maxAttempts})... (mobile: ${isMobileDevice.current})`)
                      
                      // Check if stream is still active (especially important on mobile)
                      if (streamRef.current) {
                        const audioTracks = streamRef.current.getAudioTracks()
                        const activeTracks = audioTracks.filter(t => t.readyState === 'live')
                        if (activeTracks.length === 0) {
                          console.warn("⚠ No active audio tracks, microphone may have been released")
                          // Try to re-request permission
                          if (attempt === 1) {
                            navigator.mediaDevices.getUserMedia({ audio: true })
                              .then(stream => {
                                streamRef.current = stream
                                console.log("✓ Re-acquired microphone stream")
                                setTimeout(() => attemptStart(attempt), 200)
                              })
                              .catch(err => {
                                console.error("Failed to re-acquire microphone:", err)
                                setError("Microphone access was lost. Please refresh and try again.")
                                setState("error")
                              })
                            return
                          }
                        } else {
                          console.log(`✓ Found ${activeTracks.length} active audio track(s)`)
                        }
                      } else {
                        console.warn("⚠ No stream reference - requesting new microphone access")
                        // Try to get a new stream
                        if (attempt === 1) {
                          navigator.mediaDevices.getUserMedia({ audio: true })
                            .then(stream => {
                              streamRef.current = stream
                              console.log("✓ Acquired new microphone stream")
                              setTimeout(() => attemptStart(attempt), 200)
                            })
                            .catch(err => {
                              console.error("Failed to acquire microphone:", err)
                              setError("Microphone access required. Please allow microphone access and try again.")
                              setState("error")
                            })
                          return
                        }
                      }
                      
                      recognitionRef.current!.start()
                      console.log("✓ Recognition start() called successfully")
                      
                      // Verify it actually started after a short delay
                      setTimeout(() => {
                        try {
                          const rec = recognitionRef.current as SpeechRecognition & { state?: string }
                          const isListening = rec.state === "listening" || rec.state === "starting"
                          if (!isListening && attempt < maxAttempts) {
                            console.warn("⚠ Recognition didn't start, retrying...")
                            setTimeout(() => attemptStart(attempt + 1), retryDelay)
                          } else if (isListening) {
                            console.log("✓ Recognition confirmed as listening")
                            setState("listening")
                          } else {
                            // If we've exhausted attempts, set to listening anyway and let onend handler restart
                            setState("listening")
                          }
                        } catch (verifyError) {
                          console.warn("State check failed, assuming recognition is working:", verifyError)
                          setState("listening")
                        }
                      }, verifyDelay)
                    } catch (e: unknown) {
                      if (e instanceof Error && (e.name === "InvalidStateError" || e.message?.includes("already started"))) {
                        console.log("✓ Recognition already running (this is okay)")
                        setState("listening")
                      } else {
                        console.error(`✗ Recognition start error (attempt ${attempt}):`, e)
                        // Try to reinitialize and start
                        if (attempt < maxAttempts) {
                          try {
                            console.log("Attempting to reinitialize recognition...")
                            const newRecognition = initWebSpeechRecognition()
                            if (newRecognition) {
                              recognitionRef.current = newRecognition
                              setTimeout(() => attemptStart(attempt + 1), retryDelay)
                            } else {
                              console.error("Failed to create new recognition instance")
                              setTimeout(() => attemptStart(attempt + 1), retryDelay)
                            }
                          } catch (retryError) {
                            console.error("✗ Failed to reinitialize recognition:", retryError)
                            if (attempt < maxAttempts) {
                              setTimeout(() => attemptStart(attempt + 1), reinitDelay)
                            }
                          }
                        } else {
                          console.error("✗ Failed to start recognition after all attempts")
                          setError("Failed to start speech recognition. Please refresh and try again.")
                          setState("error")
                        }
                      }
                    }
                  }
                  
                  attemptStart()
                } else {
                  console.error("✗ Recognition ref is null")
                  setError("Speech recognition failed to initialize. Please refresh and try again.")
                  setState("error")
                }
              } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
                mediaRecorderRef.current.start()
                setState("listening")
              } else {
                console.warn("No recognition method available")
                setState("listening") // Set state anyway to show we're ready
              }
            }
            
            startListening()
            return "listening"
          })
        }, startDelay)
      }

      utterance.onerror = (event) => {
        const errorType = event.error || "unknown"
        const errorName = event.type || "error"
        
        // "interrupted" errors are expected and non-critical - they happen when speech is cancelled
        // or when a new utterance starts before the previous one finishes
        if (errorType === "interrupted" || errorName === "interrupted") {
          // This is expected behavior - just log at debug level, don't treat as error
          console.log("Speech interrupted (expected when cancelling or starting new speech)")
          setIsSpeaking(false)
          // Still call onEnd and continue flow
          if (onEnd) onEnd()
          if (state !== "error" && !isMuted) {
            setState("listening")
            setTimeout(() => {
              if (useWebRecognitionFallback.current && recognitionRef.current) {
                try {
                  recognitionRef.current.start()
                } catch {
                  // Already started or error
                }
              } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
                mediaRecorderRef.current.start()
              }
            }, 150) // Reduced delay for smoother transition
          }
          return // Exit early for interrupted errors
        }
        
        // For other errors, log but continue flow
        console.warn("Web Speech synthesis error (non-critical):", errorType, errorName)
        setIsSpeaking(false)
        // Most errors are non-critical, continue the flow
        if (onEnd) onEnd()
        if (state !== "error" && !isMuted) {
          setState("listening")
          // Use refs to avoid circular dependency
          setTimeout(() => {
            if (useWebRecognitionFallback.current && recognitionRef.current) {
              try {
                recognitionRef.current.start()
              } catch {
                // Already started or error
              }
            } else if (mediaRecorderRef.current && mediaRecorderRef.current.state === "inactive") {
              mediaRecorderRef.current.start()
            }
          }, 150) // Reduced delay for smoother transition
        }
      }

      currentUtteranceRef.current = utterance
      console.log("🔊 Speaking text:", text.substring(0, 50) + "...")
      
      // Force speech to start - some browsers need this
      try {
        // Cancel any pending speech first
        window.speechSynthesis.cancel()
        // Minimal delay for faster speech start
        await new Promise(resolve => setTimeout(resolve, 50)) // Reduced from 100ms
        
        // Now speak - this MUST happen
        console.log("Calling speechSynthesis.speak()...")
        window.speechSynthesis.speak(utterance)
        console.log("speechSynthesis.speak() called")
        
        // Force update state immediately
        setIsSpeaking(true)
        setState("speaking")
        
        // Verify speech actually started - check multiple times
        let speechVerified = false
        const checkSpeech = () => {
          const isSpeakingNow = window.speechSynthesis.speaking
          if (isSpeakingNow && !speechVerified) {
            console.log("✓ Speech is speaking (verified via speaking check)")
            speechVerified = true
            setIsSpeaking(true)
            setState("speaking")
          }
          return isSpeakingNow
        }
        
        // Check immediately
        checkSpeech()
        
        // Check again after delays
        setTimeout(() => {
          if (!checkSpeech()) {
            console.warn("⚠ Speech not detected as speaking after 200ms, but utterance was created")
          }
        }, 200)
        
        setTimeout(() => {
          if (!checkSpeech()) {
            console.warn("⚠ Speech not detected as speaking after 500ms")
            // Try speaking again if it didn't start
            try {
              window.speechSynthesis.cancel()
              setTimeout(() => {
                window.speechSynthesis.speak(utterance)
                console.log("Retried speaking")
              }, 100)
            } catch (retryError) {
              console.error("Failed to retry speech:", retryError)
            }
          }
        }, 500)
      } catch (speakError) {
        console.error("✗ Error calling speechSynthesis.speak:", speakError)
        setIsSpeaking(false)
        setError(`Failed to speak: ${speakError instanceof Error ? speakError.message : "Unknown error"}`)
        setState("error")
        if (onEnd) onEnd()
        return
      }
    } catch (error) {
      console.error("Error in speakWithWebSpeech:", error)
      setIsSpeaking(false)
      setError(`Failed to speak: ${error instanceof Error ? error.message : "Unknown error"}`)
      setState("error")
      if (onEnd) onEnd()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // initWebSpeechRecognition uses speak, creating a circular dependency if included
  }, [state, isMuted, waitForVoices])

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
    // On mobile, continuous recognition may stop frequently, so we handle it differently
    recognition.continuous = true // Keep true but handle mobile-specific behavior
    recognition.interimResults = true // Enable interim results for real-time feedback
    recognition.lang = "en-US"
    recognition.maxAlternatives = 1
    
    // Mobile-specific optimizations
    if (isMobileDevice.current) {
      console.log("📱 Applying mobile-specific recognition settings")
      // On mobile, recognition may stop more frequently, so we'll be more aggressive with restarts
    }
    
    // Optimize recognition settings for faster, more accurate results
    // Some browsers support these additional settings
    try {
      // @ts-ignore - not all browsers support these
      recognition.serviceURI = undefined
      // @ts-ignore
      recognition.grammars = undefined
    } catch {
      // Ignore if not supported
    }
    // Note: serviceURI and grammars are not widely supported, so we don't set them

    // Reset accumulation when creating new recognition instance
    accumulatedTranscriptRef.current = ""
    lastFinalIndexRef.current = -1
    if (silenceTimeoutRef.current) {
      clearTimeout(silenceTimeoutRef.current)
      silenceTimeoutRef.current = null
    }

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
      
      // Accumulate ALL final results (not just the last one)
      // This ensures we capture complete sentences even if broken into multiple final results
      const newFinalResults = results
        .map((r, index) => ({ result: r, index }))
        .filter(({ result, index }) => result.isFinal && index > lastFinalIndexRef.current)
      
      if (newFinalResults.length > 0) {
        // Add new final results to accumulated transcript
        const newTranscripts = newFinalResults
          .map(({ result }) => result[0].transcript.trim())
          .filter(t => t.length > 0)
        
        if (newTranscripts.length > 0) {
          accumulatedTranscriptRef.current = (accumulatedTranscriptRef.current + " " + newTranscripts.join(" ")).trim()
          lastFinalIndexRef.current = newFinalResults[newFinalResults.length - 1].index
          console.log("Accumulated transcript so far:", accumulatedTranscriptRef.current)
        }
        
        // Clear any existing timeout
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current)
          silenceTimeoutRef.current = null
        }
        
        // Wait for a pause (silence) before processing to ensure we have the complete sentence
        // This gives the user time to finish speaking
        // On mobile, use shorter timeout as recognition may stop more frequently
        const silenceTimeout = isMobileDevice.current ? 800 : 1500
        silenceTimeoutRef.current = setTimeout(() => {
          if (isProcessingRef.current || accumulatedTranscriptRef.current.length === 0) {
            return
          }
          
          const transcript = accumulatedTranscriptRef.current
          
          // Only process if we have a meaningful transcript (at least 3 characters)
          if (transcript.length < 3) {
            console.log("Transcript too short, ignoring:", transcript)
            // Reset and continue listening
            accumulatedTranscriptRef.current = ""
            lastFinalIndexRef.current = -1
            return
          }

          console.log("Complete final transcript detected:", transcript)
          
          // Process the complete transcript
          processTranscript(transcript)
          
          // Reset for next speech
          accumulatedTranscriptRef.current = ""
          lastFinalIndexRef.current = -1
        }, silenceTimeout) // Wait for silence before processing (shorter on mobile)
      }
    }
    
    // Helper function to process the complete transcript
    const processTranscript = async (transcript: string) => {

      // Mark as processing to prevent duplicate handling
      isProcessingRef.current = true
      
      // Stop recognition while processing to avoid duplicate detections
      // But we'll restart it after the AI responds
      try {
        recognition.stop()
        console.log("Stopped recognition to process complete result")
      } catch {
        // Ignore if already stopped
      }
      
      // Clear any pending timeout
      if (silenceTimeoutRef.current) {
        clearTimeout(silenceTimeoutRef.current)
        silenceTimeoutRef.current = null
      }
      
      // Small delay to ensure recognition has stopped
      await new Promise(resolve => setTimeout(resolve, 100))

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

          // Speak the response immediately for smoother flow
          await speak(aiResponse)
          
          // Reset processing flag after speaking starts
          isProcessingRef.current = false
          
          // Ensure recognition restarts after speaking (speak's onend will handle this, but add backup)
          // The speak function's onend handler will start recognition automatically
        } catch (err: unknown) {
          console.error("AI response generation error:", err)
          // Don't break the flow - try to continue listening
          isProcessingRef.current = false
          
          // Show error but allow recovery
          const errorMsg = err instanceof Error ? err.message : "Unknown error"
          console.warn("Error generating response, attempting to continue:", errorMsg)
          
          // Try to resume listening instead of stopping completely
          if (state !== "error" && !isMuted) {
            setState("listening")
            setTimeout(() => {
              if (recognitionRef.current) {
                try {
                  recognitionRef.current.start()
                  console.log("Resumed listening after error")
                } catch {
                  // Ignore if already started
                }
              }
            }, 500)
          } else {
            setError(`Error: ${errorMsg}. Please try speaking again.`)
            setState("error")
          }
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
        // No speech detected - this is normal, just restart listening quickly
        // On mobile, this happens more frequently, so restart faster
        console.log("No speech detected, continuing to listen...")
        if (state === "listening" && !isMuted && !isProcessingRef.current) {
          // Restart faster for smoother experience, even faster on mobile
          const restartDelay = isMobileDevice.current ? 100 : 200
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
                  console.log("✓ Restarted after no-speech (mobile optimized)")
                } catch {
                  // Already started
                }
              }
            }
          }, restartDelay) // Faster restart on mobile
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
      console.log("Recognition ended - checking if should restart")
      // Auto-restart if we're still in listening state and not processing
      // This ensures continuous listening
      // BUT: Don't restart if we're processing (we manually stopped it)
      if (isProcessingRef.current) {
        console.log("Not restarting recognition - currently processing")
        return
      }
      
      if (state === "listening" && !isMuted) {
        // On mobile, recognition stops more frequently, so restart more aggressively
        const restartDelay = isMobileDevice.current ? 50 : 100
        console.log(`Recognition ended, restarting in ${restartDelay}ms... (mobile: ${isMobileDevice.current})`)
        setTimeout(() => {
          // Double-check conditions before restarting
          if (recognitionRef.current && state === "listening" && !isMuted && !isProcessingRef.current) {
            // Check if recognition is already running
            let isRunning = false
            try {
              const recognition = recognitionRef.current as SpeechRecognition & { state?: string }
              isRunning = recognition.state === "listening" || recognition.state === "starting"
            } catch {
              // State property not available, assume not running
            }
            
            if (!isRunning) {
              console.log("🔄 Restarting recognition after onend event (mobile optimized)")
              try {
                recognitionRef.current.start()
                console.log("✓ Recognition restarted successfully")
              } catch (e: unknown) {
                // If already started, that's okay - silently continue
                if (e instanceof Error && e.name !== "InvalidStateError" && !e.message?.includes("already started")) {
                  // Only log unexpected errors
                  console.warn("Recognition restart error:", e)
                  // On mobile, retry once more after a short delay
                  if (isMobileDevice.current) {
                    setTimeout(() => {
                      if (recognitionRef.current && state === "listening" && !isMuted) {
                        try {
                          recognitionRef.current.start()
                          console.log("✓ Recognition restarted on retry")
                        } catch {
                          // Ignore retry errors
                        }
                      }
                    }, 200)
                  }
                }
              }
            } else {
              console.log("Recognition already running, skipping restart")
            }
          }
        }, restartDelay) // Faster restart on mobile
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMuted, state, useWebRecognitionFallback, initWebSpeechRecognition])

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
  }, [state, isMuted, startRecording])

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

  // Test browser compatibility
  const testBrowserCompatibility = useCallback(() => {
    const issues: string[] = []
    
    if (typeof window === "undefined") {
      issues.push("Window object not available")
      return issues
    }
    
    if (!("speechSynthesis" in window)) {
      issues.push("Speech synthesis not supported")
    } else if (!window.speechSynthesis) {
      issues.push("Speech synthesis not available")
    }
    
    const SpeechRecognition = 
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognition }).SpeechRecognition || 
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognition }).webkitSpeechRecognition
    
    if (!SpeechRecognition) {
      issues.push("Speech recognition not supported - please use Chrome, Edge, or Safari")
    }
    
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      issues.push("Microphone access not available")
    }
    
    return issues
  }, [])

  // Start the interview
  const start = useCallback(async () => {
    try {
      setState("connecting")
      setError(null)
      setMessages([])
      setCallDuration(0)
      startTimeRef.current = new Date()

      // Test browser compatibility first
      const compatibilityIssues = testBrowserCompatibility()
      if (compatibilityIssues.length > 0) {
        console.error("Browser compatibility issues:", compatibilityIssues)
        setError(`Browser compatibility issues: ${compatibilityIssues.join(", ")}. Please use Chrome, Edge, or Safari.`)
        setState("error")
        return
      }

      // Request microphone permission - MUST be done in user interaction context
      // On mobile, this is critical and must happen before recognition starts
      console.log("📱 Requesting microphone permission... (mobile:", isMobileDevice.current, ")")
      
      // Check if permission is already granted
      let permissionGranted = false
      try {
        const permissionStatus = await navigator.permissions.query({ name: 'microphone' as PermissionName })
        console.log("Current microphone permission status:", permissionStatus.state)
        if (permissionStatus.state === 'granted') {
          permissionGranted = true
          console.log("✓ Microphone permission already granted")
        }
      } catch (permError) {
        // Permissions API might not be supported, that's okay
        console.log("Permissions API not available, will request directly")
      }
      
      // Request microphone access explicitly
      try {
        // On mobile, use simpler audio constraints for better compatibility
        const audioConstraints = isMobileDevice.current 
          ? { audio: true } // Simpler for mobile
          : { 
              audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
              } 
            }
        
        console.log("Requesting getUserMedia with constraints:", audioConstraints)
        const stream = await navigator.mediaDevices.getUserMedia(audioConstraints)
        streamRef.current = stream
        console.log("✓ Microphone access granted, stream active:", stream.active)
        
        // Verify stream has audio tracks
        const audioTracks = stream.getAudioTracks()
        if (audioTracks.length === 0) {
          throw new Error("No audio tracks in stream")
        }
        console.log(`✓ Found ${audioTracks.length} audio track(s)`)
        
        // Keep stream active to maintain permission
        // Don't stop tracks here - we need them for recognition
        // On mobile, keeping the stream active is especially important
        audioTracks.forEach(track => {
          console.log("Audio track:", track.label, "enabled:", track.enabled, "readyState:", track.readyState)
        })
      } catch (error: any) {
        console.error("✗ Microphone access denied:", error)
        console.error("Error details:", {
          name: error.name,
          message: error.message,
          stack: error.stack
        })
        
        let errorMessage = "Microphone access denied. "
        if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
          errorMessage += isMobileDevice.current 
            ? "Please tap 'Allow' when your browser asks for microphone permission. You may need to check your browser settings if the prompt doesn't appear."
            : "Please click 'Allow' when prompted, or enable microphone access in your browser settings."
        } else if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
          errorMessage += "No microphone found. Please connect a microphone and try again."
        } else if (error.name === "NotReadableError" || error.name === "TrackStartError") {
          errorMessage += "Microphone is being used by another application. Please close other apps using the microphone and try again."
        } else {
          errorMessage += `Error: ${error.message || error.name || "Unknown error"}. Please try again.`
        }
        setError(errorMessage)
        setState("error")
        return
      }

      // Pre-initialize speech recognition early (before speaking) to ensure it's ready
      // On mobile, this is especially important as recognition may need permission too
      if (useWebRecognitionFallback.current) {
        console.log("Pre-initializing speech recognition... (mobile:", isMobileDevice.current, ")")
        if (!recognitionRef.current) {
          const recognition = initWebSpeechRecognition()
          if (recognition) {
            recognitionRef.current = recognition
            console.log("✓ Speech recognition pre-initialized successfully")
            
            // On mobile, try a test start/stop to ensure permission is granted
            // This helps trigger any additional permission prompts
            if (isMobileDevice.current) {
              console.log("📱 Testing recognition on mobile to verify permission...")
              try {
                // Try to start recognition briefly to trigger permission if needed
                recognition.start()
                // Stop immediately - we just want to trigger permission
                setTimeout(() => {
                  try {
                    recognition.stop()
                    console.log("✓ Mobile recognition permission verified")
                  } catch {
                    // Already stopped or error, that's okay
                  }
                }, 100)
              } catch (testError: any) {
                console.warn("Mobile recognition test error (may be normal):", testError)
                // Don't fail here - the error might be because it's already running or permission is pending
                // We'll handle actual permission errors when we start for real
              }
            }
          } else {
            console.error("Failed to pre-initialize speech recognition")
            setError("Speech recognition is not available. Please use Chrome, Edge, or Safari.")
            setState("error")
            return
          }
        }
      }

      // Pre-load voices to ensure they're available when needed
      if (typeof window !== "undefined" && window.speechSynthesis) {
        console.log("Pre-loading voices...")
        const voices = window.speechSynthesis.getVoices()
        if (voices.length === 0) {
          // Wait for voices to load
          await new Promise<void>((resolve) => {
            const onVoicesChanged = () => {
              const loadedVoices = window.speechSynthesis.getVoices()
              if (loadedVoices.length > 0) {
                window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged)
                console.log(`Loaded ${loadedVoices.length} voices`)
                resolve()
              }
            }
            window.speechSynthesis.addEventListener("voiceschanged", onVoicesChanged)
            // Fallback timeout
            setTimeout(() => {
              window.speechSynthesis.removeEventListener("voiceschanged", onVoicesChanged)
              console.warn("Voice loading timeout, continuing anyway")
              resolve()
            }, 2000)
          })
        } else {
          console.log(`Already have ${voices.length} voices loaded`)
        }
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
        console.log("Generating initial greeting...")
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
        console.log("Initial greeting generated:", initialResponse.substring(0, 50) + "...")

        const assistantMessage: VoiceInterviewMessage = {
          role: "assistant",
          text: initialResponse,
          timestamp: new Date(),
        }

        setMessages([assistantMessage])
        messagesRef.current = [assistantMessage]
        onMessage?.(assistantMessage)

        // Speak the initial greeting, then start listening
        console.log("🔊 Speaking initial greeting...")
        console.log("Initial response text:", initialResponse)
        
        // Ensure we actually call speak
        if (!initialResponse || initialResponse.trim().length === 0) {
          console.error("✗ Initial response is empty!")
          setError("Failed to generate initial greeting. Please try again.")
          setState("error")
          return
        }
        
        await speak(initialResponse, () => {
          // This callback is called when speech ends
          // The speak function's onend handler will start recognition
          console.log("✓ Initial greeting callback fired - recognition should start automatically")
        })
        
        // Double-check that speech was called
        console.log("speak() function called, checking if speech started...")
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobInfo, userName, onMessage, speak, initWebSpeechRecognition, testBrowserCompatibility])

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

