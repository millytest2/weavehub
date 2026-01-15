import { useState, useRef, useCallback } from 'react';
import { supabase } from "@/integrations/supabase/client";
import { toast } from 'sonner';

interface UseVoiceCaptureWhisperOptions {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  maxDuration?: number; // in seconds, default 120
}

export const useVoiceCaptureWhisper = (options: UseVoiceCaptureWhisperOptions = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const maxDuration = options.maxDuration || 120;

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        } 
      });
      
      streamRef.current = stream;
      audioChunksRef.current = [];
      
      // Use webm for better compatibility
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : 'audio/mp4';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorder.onstop = async () => {
        // Stop all tracks
        streamRef.current?.getTracks().forEach(track => track.stop());
        
        if (audioChunksRef.current.length === 0) {
          options.onError?.('No audio recorded');
          return;
        }
        
        setIsTranscribing(true);
        
        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          
          // Convert to base64
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const base64 = (reader.result as string).split(',')[1];
              resolve(base64);
            };
            reader.onerror = reject;
          });
          reader.readAsDataURL(audioBlob);
          const base64Audio = await base64Promise;
          
          // Send to Whisper API via edge function
          const { data, error } = await supabase.functions.invoke('voice-transcribe', {
            body: { audio: base64Audio, mimeType }
          });
          
          if (error) throw error;
          
          if (data?.text) {
            options.onTranscript?.(data.text);
          } else {
            throw new Error('No transcription received');
          }
        } catch (err: any) {
          console.error('Transcription error:', err);
          const errorMsg = err.message || 'Failed to transcribe audio';
          toast.error(errorMsg);
          options.onError?.(errorMsg);
        } finally {
          setIsTranscribing(false);
        }
      };
      
      // Start recording - collect data every second for streaming
      mediaRecorder.start(1000);
      setIsRecording(true);
      setRecordingDuration(0);
      
      // Timer for duration
      timerRef.current = setInterval(() => {
        setRecordingDuration(prev => {
          const newDuration = prev + 1;
          // Auto-stop at max duration
          if (newDuration >= maxDuration) {
            stopRecording();
            toast.info(`Recording stopped at ${maxDuration}s limit`);
          }
          return newDuration;
        });
      }, 1000);
      
    } catch (err: any) {
      console.error('Recording error:', err);
      const errorMessage = err.name === 'NotAllowedError' 
        ? 'Microphone access denied. Please allow access to use voice capture.'
        : 'Failed to start recording';
      toast.error(errorMessage);
      options.onError?.(errorMessage);
    }
  }, [options, maxDuration]);

  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  }, [isRecording]);

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
    startRecording,
    stopRecording,
    toggleRecording,
    maxDuration,
  };
};
