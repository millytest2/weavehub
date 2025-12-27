import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseVoiceCaptureOptions {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

export const useVoiceCapture = (options: UseVoiceCaptureOptions = {}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Use webm format which is widely supported
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? 'audio/webm;codecs=opus' 
        : 'audio/webm';
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = async () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        if (chunksRef.current.length === 0) {
          options.onError?.('No audio recorded');
          return;
        }

        setIsTranscribing(true);
        try {
          const audioBlob = new Blob(chunksRef.current, { type: mimeType });
          
          // Convert to base64
          const reader = new FileReader();
          const base64Promise = new Promise<string>((resolve, reject) => {
            reader.onloadend = () => {
              const base64 = reader.result as string;
              const base64Data = base64.split(',')[1];
              resolve(base64Data);
            };
            reader.onerror = reject;
          });
          reader.readAsDataURL(audioBlob);
          const base64Audio = await base64Promise;

          // Send to edge function
          const { data, error } = await supabase.functions.invoke('voice-transcribe', {
            body: { audio: base64Audio, mimeType }
          });

          if (error) {
            throw error;
          }

          if (data?.text) {
            options.onTranscript?.(data.text);
          } else {
            throw new Error('No transcription returned');
          }
        } catch (err: any) {
          console.error('Transcription error:', err);
          const errorMessage = err.message || 'Failed to transcribe audio';
          toast.error(errorMessage);
          options.onError?.(errorMessage);
        } finally {
          setIsTranscribing(false);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
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

  return {
    isRecording,
    isTranscribing,
    startRecording,
    stopRecording,
    toggleRecording
  };
};
