import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

interface UseVoiceCaptureWebSpeechOptions {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  maxDuration?: number; // in seconds, default 120
}

// Extend Window interface for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

export const useVoiceCaptureWebSpeech = (options: UseVoiceCaptureWebSpeechOptions = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState('');
  
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fullTranscriptRef = useRef<string>('');
  const isStoppingRef = useRef(false);
  
  const maxDuration = options.maxDuration || 120;

  // Check if Web Speech API is supported
  const isSupported = typeof window !== 'undefined' && 
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, []);

  const startRecording = useCallback(async () => {
    if (!isSupported) {
      const error = 'Speech recognition not supported in this browser. Try Chrome or Edge.';
      toast.error(error);
      options.onError?.(error);
      return;
    }

    try {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      
      fullTranscriptRef.current = '';
      isStoppingRef.current = false;
      
      recognition.onstart = () => {
        setIsRecording(true);
        setRecordingDuration(0);
        setInterimTranscript('');
        
        // Timer for duration
        timerRef.current = setInterval(() => {
          setRecordingDuration(prev => {
            const newDuration = prev + 1;
            if (newDuration >= maxDuration) {
              stopRecording();
              toast.info(`Recording stopped at ${maxDuration}s limit`);
            }
            return newDuration;
          });
        }, 1000);
      };
      
      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let final = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            final += transcript;
          } else {
            interim += transcript;
          }
        }
        
        if (final) {
          fullTranscriptRef.current += (fullTranscriptRef.current ? ' ' : '') + final;
        }
        setInterimTranscript(interim);
      };
      
      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        
        if (event.error === 'no-speech') {
          // This is not a fatal error, just no speech detected
          return;
        }
        
        if (event.error === 'aborted' && isStoppingRef.current) {
          // Expected when we stop manually
          return;
        }
        
        const errorMessage = event.error === 'not-allowed'
          ? 'Microphone access denied. Please allow access to use voice capture.'
          : `Speech recognition error: ${event.error}`;
        
        toast.error(errorMessage);
        options.onError?.(errorMessage);
        
        setIsRecording(false);
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      };
      
      recognition.onend = () => {
        setIsRecording(false);
        setIsTranscribing(false);
        setInterimTranscript('');
        
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
        
        // Only send transcript if we have content and were intentionally stopping
        if (fullTranscriptRef.current.trim() && isStoppingRef.current) {
          options.onTranscript?.(fullTranscriptRef.current.trim());
        }
      };
      
      recognitionRef.current = recognition;
      recognition.start();
      
    } catch (err: any) {
      console.error('Recording error:', err);
      const errorMessage = 'Failed to start voice recognition';
      toast.error(errorMessage);
      options.onError?.(errorMessage);
    }
  }, [options, maxDuration, isSupported]);

  const stopRecording = useCallback(() => {
    isStoppingRef.current = true;
    setIsTranscribing(true);
    
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return {
    isRecording,
    isTranscribing,
    recordingDuration,
    formattedDuration: formatDuration(recordingDuration),
    interimTranscript,
    startRecording,
    stopRecording,
    toggleRecording,
    maxDuration,
    isSupported,
  };
};
