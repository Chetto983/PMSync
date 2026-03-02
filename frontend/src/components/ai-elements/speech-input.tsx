"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoaderIcon, MicIcon, SquareIcon } from "lucide-react";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- browser SpeechRecognition API, types provided by @assistant-ui/core
type SpeechRecognitionAny = any;

type SpeechInputMode = "speech-recognition" | "media-recorder" | "none";

export type SpeechInputProps = ComponentProps<typeof Button> & {
  onTranscriptionChange?: (text: string) => void;
  /**
   * Callback for when audio is recorded using MediaRecorder fallback.
   * This is called in browsers that don't support the Web Speech API (Firefox, Safari).
   * The callback receives an audio Blob that should be sent to a transcription service.
   * Return the transcribed text, which will be passed to onTranscriptionChange.
   */
  onAudioRecorded?: (audioBlob: Blob) => Promise<string>;
  lang?: string;
};

const detectSpeechInputMode = (): SpeechInputMode => {
  if (typeof window === "undefined") {
    return "none";
  }

  if ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) {
    return "speech-recognition";
  }

  if ("MediaRecorder" in window && "mediaDevices" in navigator) {
    return "media-recorder";
  }

  return "none";
};

export const SpeechInput = ({
  className,
  onTranscriptionChange,
  onAudioRecorded,
  lang = "en-US",
  ...props
}: SpeechInputProps) => {
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<SpeechInputMode>("none");
  const [recognition, setRecognition] = useState<SpeechRecognitionAny | null>(
    null
  );
  const recognitionRef = useRef<SpeechRecognitionAny | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Detect mode on mount
  useEffect(() => {
    setMode(detectSpeechInputMode());
  }, []);

  // Initialize Speech Recognition when mode is speech-recognition
  useEffect(() => {
    if (mode !== "speech-recognition") {
      return;
    }

    const SpeechRecognitionCtor =
      (window as SpeechRecognitionAny).SpeechRecognition || (window as SpeechRecognitionAny).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    const speechRecognition = new SpeechRecognitionCtor();

    speechRecognition.continuous = true;
    speechRecognition.interimResults = true;
    speechRecognition.lang = lang;

    speechRecognition.onstart = () => {
      setIsListening(true);
    };

    speechRecognition.onend = () => {
      setIsListening(false);
    };

    speechRecognition.onresult = (event: SpeechRecognitionAny) => {
      let finalTranscript = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0]?.transcript ?? "";
        }
      }

      if (finalTranscript) {
        onTranscriptionChange?.(finalTranscript);
      }
    };

    speechRecognition.onerror = (_event: SpeechRecognitionAny) => {
      //console.error("Speech recognition error:", event.error);
      setIsListening(false);
    };

    recognitionRef.current = speechRecognition;
    setRecognition(speechRecognition);

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [mode, onTranscriptionChange, lang]);

  // Start MediaRecorder recording
  const startMediaRecorder = useCallback(async () => {
    if (!onAudioRecorded) {
     /* console.warn(
        "SpeechInput: onAudioRecorded callback is required for MediaRecorder fallback"
      );*/
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks to release the microphone
        for (const track of stream.getTracks()) {
          track.stop();
        }

        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/webm",
        });

        if (audioBlob.size > 0) {
          setIsProcessing(true);
          try {
            const transcript = await onAudioRecorded(audioBlob);
            if (transcript) {
              onTranscriptionChange?.(transcript);
            }
          } catch {
            //console.error("Transcription error:", error);
          } finally {
            setIsProcessing(false);
          }
        }
      };

      mediaRecorder.onerror = (_event) => {
        //console.error("MediaRecorder error:", event);
        setIsListening(false);
        // Stop all tracks on error
        for (const track of stream.getTracks()) {
          track.stop();
        }
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setIsListening(true);
    } catch {
      //console.error("Failed to start MediaRecorder:", error);
      setIsListening(false);
    }
  }, [onAudioRecorded, onTranscriptionChange]);

  // Stop MediaRecorder recording
  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (mode === "speech-recognition" && recognition) {
      if (isListening) {
        recognition.stop();
      } else {
        recognition.start();
      }
    } else if (mode === "media-recorder") {
      if (isListening) {
        stopMediaRecorder();
      } else {
        startMediaRecorder();
      }
    }
  }, [mode, recognition, isListening, startMediaRecorder, stopMediaRecorder]);

  // Determine if button should be disabled
  const isDisabled =
    mode === "none" ||
    (mode === "speech-recognition" && !recognition) ||
    (mode === "media-recorder" && !onAudioRecorded) ||
    isProcessing;

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Animated pulse rings */}
      {isListening &&
        [0, 1, 2].map((index) => (
          <div
            className="absolute inset-0 animate-ping rounded-full border-2 border-red-400/30"
            key={index}
            style={{
              animationDelay: `${index * 0.3}s`,
              animationDuration: "2s",
            }}
          />
        ))}

      {/* Main record button */}
      <Button
        className={cn(
          "relative z-10 rounded-full transition-all duration-300",
          isListening
            ? "bg-destructive text-white hover:bg-destructive/80 hover:text-white"
            : "bg-primary text-primary-foreground hover:bg-primary/80 hover:text-primary-foreground",
          className
        )}
        disabled={isDisabled}
        onClick={toggleListening}
        {...props}
      >
        {isProcessing && <LoaderIcon className="size-4 animate-spin" />}
        {!isProcessing && isListening && <SquareIcon className="size-4" />}
        {!(isProcessing || isListening) && <MicIcon className="size-4" />}
      </Button>
    </div>
  );
};
