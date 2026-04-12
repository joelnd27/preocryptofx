import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, User, Bot, Headset } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import axios from 'axios';

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot' | 'agent';
  timestamp: number;
}

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hello! I am your PreoCryptoFX AI assistant. How can I help you today?',
      sender: 'bot',
      timestamp: Date.now()
    }
  ]);
  const [input, setInput] = useState('');
  const [isEscalated, setIsEscalated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userText = input.trim();
    const userMsg: Message = {
      id: Date.now().toString(),
      text: userText,
      sender: 'user',
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      if (userText.toLowerCase().includes('agent') || userText.toLowerCase().includes('human')) {
        setIsEscalated(true);
        const agentMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: 'Please wait for a human agent...',
          sender: 'bot',
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, agentMsg]);
        
        setTimeout(() => {
          const waitMsg: Message = {
            id: (Date.now() + 2).toString(),
            text: 'Please wait',
            sender: 'bot',
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, waitMsg]);
          setIsLoading(false);
        }, 2000);
      } else if (isEscalated) {
        // If already escalated, just say please wait
        setTimeout(() => {
          const waitMsg: Message = {
            id: Date.now().toString(),
            text: 'Please wait',
            sender: 'bot',
            timestamp: Date.now()
          };
          setMessages(prev => [...prev, waitMsg]);
          setIsLoading(false);
        }, 1000);
      } else {
        // Use backend for AI response
        const response = await axios.post('/api/ai/chat', { message: userText });

        const botMsg: Message = {
          id: (Date.now() + 1).toString(),
          text: response.data.text || "I'm sorry, I couldn't process that. Please try again or type 'agent' for help.",
          sender: 'bot',
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, botMsg]);
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Chatbot error:', error);
      const errorMsg: Message = {
        id: Date.now().toString(),
        text: "I'm having trouble connecting. Please try again later.",
        sender: 'bot',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, errorMsg]);
      setIsLoading(false);
    }
  };

  const closeChat = () => {
    setIsOpen(false);
    // Reset state when closing if desired, or keep it. 
    // User said "it is not exiting", so let's ensure it closes.
  };

  return (
    <>
      {/* Floating Button */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-6 right-6 w-14 h-14 bg-blue-600 text-white rounded-full shadow-2xl shadow-blue-600/40 flex items-center justify-center hover:scale-110 transition-transform z-50"
          >
            <MessageSquare size={24} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            className="fixed bottom-6 right-6 w-[calc(100vw-3rem)] sm:w-96 h-[500px] max-h-[calc(100vh-6rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="p-4 bg-blue-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  {isEscalated ? <Headset size={20} /> : <Bot size={20} />}
                </div>
                <div>
                  <h4 className="font-bold text-sm">{isEscalated ? 'Support Queue' : 'AI Assistant'}</h4>
                  <p className="text-[10px] opacity-80">{isEscalated ? 'Waiting for agent' : 'Always active'}</p>
                </div>
              </div>
              <button onClick={closeChat} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-50 dark:bg-slate-950/50">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex gap-3 max-w-[85%]",
                    msg.sender === 'user' ? "ml-auto flex-row-reverse" : ""
                  )}
                >
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center shrink-0",
                    msg.sender === 'user' ? "bg-slate-200 dark:bg-slate-800" : "bg-blue-600 text-white"
                  )}>
                    {msg.sender === 'user' ? <User size={14} /> : msg.sender === 'agent' ? <Headset size={14} /> : <Bot size={14} />}
                  </div>
                  <div className={cn(
                    "p-3 rounded-2xl text-xs leading-relaxed shadow-sm",
                    msg.sender === 'user' 
                      ? "bg-blue-600 text-white rounded-tr-none" 
                      : "bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-tl-none border border-slate-100 dark:border-slate-700"
                  )}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                    <Bot size={14} />
                  </div>
                  <div className="bg-white dark:bg-slate-800 p-3 rounded-2xl rounded-tl-none border border-slate-100 dark:border-slate-700">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <form onSubmit={handleSend} className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={isEscalated ? "Waiting for agent..." : "Type your message..."}
                disabled={isLoading}
                className="flex-1 bg-slate-100 dark:bg-slate-800 border-none rounded-xl px-4 py-2 text-xs focus:ring-2 focus:ring-blue-500 transition-all text-slate-900 dark:text-white disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="p-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:hover:bg-blue-600"
              >
                <Send size={18} />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
