import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChatMessage } from '../types';
import { streamChatResponse, transcribeAudio } from '../services/geminiService';
import { Spinner, BotIcon } from './common';

interface ChatWindowProps {
  systemInstruction: string;
  chatType: 'general' | 'recruiter' | 'seeker';
  onClose?: () => void;
  title: string;
  initialMessage?: string;
  initialMessages?: ChatMessage[];
  onMessagesUpdate?: (messages: ChatMessage[]) => void;
  disableAutoScroll?: boolean;
}

const SendIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white">
    <path d="m22 2-7 20-4-9-9-4Z" />
    <path d="M22 2 11 13" />
  </svg>
);

const MicIcon = ({ className }: { className?: string }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" x2="12" y1="19" y2="22" />
  </svg>
);

const StopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);

type VoiceState = 'idle' | 'recording' | 'transcribing';

const ChatWindow: React.FC<ChatWindowProps> = ({ systemInstruction, chatType, onClose, title, initialMessage, initialMessages, onMessagesUpdate, disableAutoScroll = false }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages || (initialMessage ? [{ role: 'model', text: initialMessage }] : []));
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [micError, setMicError] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isSendingRef = useRef(false);

  // Update messages when initialMessages changes (for resuming chats)
  useEffect(() => {
    if (initialMessages && initialMessages.length > 0 && messages.length === 0) {
      setMessages(initialMessages);
    }
  }, [initialMessages]);

  const scrollToBottom = () => {
    if (disableAutoScroll) return;
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages, disableAutoScroll]);

  useEffect(() => {
    if (onMessagesUpdate) {
      onMessagesUpdate(messages);
    }
  }, [messages, onMessagesUpdate]);

  const handleSend = async () => {
    if (!input.trim() || isLoading || isSendingRef.current) return;

    const userMessage: ChatMessage = { role: 'user', text: input };
    isSendingRef.current = true;
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsLoading(true);

    const modelResponse: ChatMessage = { role: 'model', text: '' };
    setMessages(prev => [...prev, modelResponse]);

    try {
      await streamChatResponse(
        [...messages, userMessage],
        input,
        chatType,
        systemInstruction,
        (chunk) => {
          setMessages(prev => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage && lastMessage.role === 'model') {
              const updatedLastMessage = { ...lastMessage, text: lastMessage.text + chunk };
              return [...prev.slice(0, -1), updatedLastMessage];
            }
            return prev;
          });
        }
      );
    } catch (error) {
      console.error("Error streaming chat response:", error);
      setMessages(prev => {
        const lastMessage = prev[prev.length - 1];
        if (lastMessage && lastMessage.role === 'model') {
          const updatedLastMessage = {
            ...lastMessage,
            text: 'Sorry, I encountered a temporary issue. Please send your last message again.'
          };
          return [...prev.slice(0, -1), updatedLastMessage];
        }
        return prev;
      });
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
    }
  };

  const startRecording = useCallback(async () => {
    setMicError(null);

    // navigator.mediaDevices is only available in secure contexts (HTTPS or localhost).
    // On plain HTTP with a network IP it is undefined — show a clear, actionable message.
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicError(
        'Voice requires a secure connection. Open the app via http://localhost:3000 instead of your network IP.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      // Pick a supported MIME type (webm is widely supported)
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : 'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        // Stop all tracks to release the mic
        stream.getTracks().forEach(t => t.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];

        if (audioBlob.size < 1000) {
          setVoiceState('idle');
          return; // Too small — likely no audio captured
        }

        setVoiceState('transcribing');
        try {
          const transcript = await transcribeAudio(audioBlob);
          if (transcript) {
            setInput(prev => prev ? prev + ' ' + transcript : transcript);
            // Resize textarea
            if (textareaRef.current) {
              textareaRef.current.style.height = 'auto';
              textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
            }
          }
        } catch (err: any) {
          console.error('Transcription error:', err);
          const msg = err?.message || err?.toString() || 'Unknown error';
          setMicError(`Transcription error: ${msg}`);
        } finally {
          setVoiceState('idle');

        }
      };

      recorder.start();
      setVoiceState('recording');
    } catch (err: any) {
      console.error('Microphone error — name:', err?.name, '— message:', err?.message, err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Microphone access denied. Please allow microphone access in your browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setMicError('No microphone found. Please connect a microphone and try again.');
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        setMicError('Microphone is in use by another app. Please close other apps using the mic and try again.');
      } else if (err.name === 'SecurityError') {
        setMicError('Microphone blocked: the browser requires a secure context (HTTPS or localhost). Check the browser URL.');
      } else if (err.name === 'OverconstrainedError') {
        setMicError('Microphone constraints could not be satisfied. Please try a different browser.');
      } else {
        setMicError(`Microphone error (${err?.name || 'unknown'}): ${err?.message || 'Please check browser and OS mic permissions.'}`);
      }
      setVoiceState('idle');
    }

  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const handleMicClick = () => {
    if (voiceState === 'idle') {
      startRecording();
    } else if (voiceState === 'recording') {
      stopRecording();
    }
    // If transcribing, do nothing — wait for it to finish
  };

  const getMicButtonStyle = () => {
    if (voiceState === 'recording') {
      return 'p-3 bg-red-500 text-white rounded-full shadow-md hover:shadow-lg transform transition-all duration-200 animate-pulse';
    }
    if (voiceState === 'transcribing') {
      return 'p-3 bg-amber-400 text-white rounded-full shadow-md cursor-wait';
    }
    return 'p-3 bg-slate-200 dark:bg-slate-600 text-slate-600 dark:text-slate-200 rounded-full shadow-sm hover:shadow-md hover:bg-slate-300 dark:hover:bg-slate-500 transform transition-all duration-200';
  };

  const getMicTitle = () => {
    if (voiceState === 'recording') return 'Stop recording';
    if (voiceState === 'transcribing') return 'Transcribing…';
    return 'Record voice message';
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl relative overflow-hidden">
      <div className="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 z-10">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 text-2xl leading-none">&times;</button>
        )}
      </div>

      <div ref={messagesContainerRef} className="flex-1 p-4 overflow-y-auto space-y-4">
        {messages.map((msg, index) => (
          <div key={index} className={`flex items-start gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}>
            {msg.role === 'model' && (
              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-orange-500 text-white flex items-center justify-center">
                <BotIcon />
              </div>
            )}
            <div className={`max-w-[85%] sm:max-w-[75%] px-4 py-2 rounded-2xl ${msg.role === 'user' ? 'bg-indigo-600 text-white rounded-tr-sm' : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-tl-sm'}`}>
              <p className="whitespace-pre-wrap leading-relaxed">{msg.text.split('\n---INTERNAL---')[0]}</p>
            </div>
          </div>
        ))}
        {isLoading && messages[messages.length - 1]?.role === 'model' && <div className="ml-11"><Spinner /></div>}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
        {/* Mic error banner */}
        {micError && (
          <div className="mb-2 px-3 py-2 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 rounded-lg text-red-600 dark:text-red-400 text-xs flex items-center justify-between">
            <span>{micError}</span>
            <button onClick={() => setMicError(null)} className="ml-2 text-red-400 hover:text-red-600 font-bold leading-none">&times;</button>
          </div>
        )}

        {/* Recording indicator */}
        {voiceState === 'recording' && (
          <div className="mb-2 px-3 py-1.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-600 dark:text-red-400 text-xs font-medium">Recording… tap ⏹ to stop</span>
          </div>
        )}
        {voiceState === 'transcribing' && (
          <div className="mb-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg flex items-center gap-2">
            <Spinner />
            <span className="text-amber-600 dark:text-amber-400 text-xs font-medium">Transcribing with Gemini…</span>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              id="chat-input-area"
              rows={1}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={voiceState === 'recording' ? '🎙️ Listening…' : voiceState === 'transcribing' ? '✨ Transcribing…' : 'Type or record a message…'}
              disabled={isLoading || voiceState === 'transcribing'}
              className="w-full p-3 border border-slate-300 dark:border-slate-600 rounded-2xl focus:ring-2 focus:ring-orange-500 focus:outline-none dark:bg-slate-700 dark:text-white resize-none overflow-y-auto transition-all duration-100 min-h-[48px]"
            />
          </div>
          <div className="flex gap-2 mb-1">
            {/* Mic button */}
            <button
              onClick={handleMicClick}
              disabled={isLoading || voiceState === 'transcribing'}
              title={getMicTitle()}
              className={getMicButtonStyle()}
            >
              {voiceState === 'recording' ? <StopIcon /> : <MicIcon />}
            </button>

            {/* Send button */}
            <button
              onClick={() => {
                handleSend();
                if (textareaRef.current) textareaRef.current.style.height = 'auto';
              }}
              disabled={isLoading || !input.trim()}
              className="p-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-full shadow-md hover:shadow-lg transform transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatWindow;
