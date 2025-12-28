import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';

interface UseVoiceCaptureOptions {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

// Extend Window interface for SpeechRecognition
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

type SpeechRecognitionType = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
};

export const useVoiceCapture = (options: UseVoiceCaptureOptions = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<InstanceType<SpeechRecognitionType> | null>(null);
  const transcriptRef = useRef<string>('');

  useEffect(() => {
    // Check for browser support
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setIsSupported(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      const errorMsg = 'Speech recognition is not supported in this browser. Try Chrome, Edge, or Safari.';
      toast.error(errorMsg);
      options.onError?.(errorMsg);
      return;
    }

    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });
      
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      transcriptRef.current = '';

      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onstart = () => {
        setIsRecording(true);
        setIsTranscribing(false);
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interimTranscript += transcript;
          }
        }

        if (finalTranscript) {
          transcriptRef.current += finalTranscript;
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.error('Speech recognition error:', event.error);
        setIsRecording(false);
        setIsTranscribing(false);
        
        let errorMessage = 'Speech recognition error';
        switch (event.error) {
          case 'not-allowed':
            errorMessage = 'Microphone access denied. Please allow access to use voice capture.';
            break;
          case 'no-speech':
            errorMessage = 'No speech detected. Please try again.';
            break;
          case 'network':
            errorMessage = 'Network error. Please check your connection.';
            break;
          case 'aborted':
            // User stopped, not an error
            return;
        }
        
        toast.error(errorMessage);
        options.onError?.(errorMessage);
      };

      recognition.onend = () => {
        setIsRecording(false);
        
        if (transcriptRef.current.trim()) {
          setIsTranscribing(true);
          // Small delay to show transcribing state
          setTimeout(() => {
            options.onTranscript?.(transcriptRef.current.trim());
            setIsTranscribing(false);
          }, 300);
        } else {
          setIsTranscribing(false);
        }
      };

      recognition.start();
    } catch (err: any) {
      console.error('Recording error:', err);
      const errorMessage = err.name === 'NotAllowedError' 
        ? 'Microphone access denied. Please allow access to use voice capture.'
        : 'Failed to start recording';
      toast.error(errorMessage);
      options.onError?.(errorMessage);
    }
  }, [options]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current && isRecording) {
      recognitionRef.current.stop();
    }
  }, [isRecording]);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  return {
    isRecording,
    isTranscribing,
    isSupported,
    startRecording,
    stopRecording,
    toggleRecording
  };
};
