import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, User, Bot, Headset } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { GoogleGenAI } from "@google/genai";

interface Message {
  id: string;
  text: string;
  sender: 'user' | 'bot' | 'agent';
  timestamp: number;
}

// Initialize Gemini AI directly on the frontend as per skill guidelines
const GEMINI_API_KEY = (process.env as any).GEMINI_API_KEY;
const ai = GEMINI_API_KEY ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

const SYSTEM_INSTRUCTION = `You are the PreoCryptoFX AI assistant. You are a real human-like expert in crypto trading and the PreoCryptoFX platform. 

CONVERSATION STYLE:
- Speak like a helpful human, not a robot. Be warm, engaging, and professional.
- Use natural transitions and follow-up questions to keep the conversation flowing.
- Answer questions about crypto, trading, and platform features (deposits, withdrawals, bots) with deep expertise.
- Your goal is to solve the user's problem yourself through conversation.
- If the user asks general questions or quizzes you, answer them accurately while maintaining your persona.

STRICT RULES:
1. NEVER mention "agents", "human support", "speaking to a person", or "contacting support" proactively. 
2. NEVER suggest that the user should talk to an agent. You are the expert.
3. If the user asks about a balance not reflecting, explain that it usually takes a few minutes for the blockchain or payment provider to confirm, and suggest they refresh in a moment.
4. If and ONLY IF the user explicitly insists on talking to a human or an agent (e.g., "I want to talk to a person", "give me an agent", "human support please"), respond exactly with: "Connecting to an agent, please wait..."
5. Use plain text only. No markdown, no bold, no headers.`;

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

    if (!ai) {
      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: "I'm currently in maintenance mode. Please try again later or contact support if you have an urgent request.",
        sender: 'bot',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, botMsg]);
      setIsLoading(false);
      return;
    }

    try {
      // Use direct Gemini API call from frontend
      const history = messages.map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [...history.slice(-6), { role: 'user', parts: [{ text: userText }] }],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.7,
        }
      });

      const botText = response.text || "I'm here to help! What would you like to know about trading today?";

      if (botText.includes('Connecting to an agent, please wait...')) {
        setIsEscalated(true);
      }

      const botMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: botText,
        sender: 'bot',
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, botMsg]);
      setIsLoading(false);
    } catch (error) {
      console.error('Chatbot error:', error);
      
      // Fallback for simple questions if complex one fails
      try {
        const fallbackResponse = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `The user asked: "${userText}". Answer them as a helpful crypto trading assistant.`
        });
        
        const botMsg: Message = {
          id: Date.now().toString(),
          text: fallbackResponse.text || "I'm here and listening! Could you tell me a bit more about what you're looking for?",
          sender: 'bot',
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, botMsg]);
      } catch (fallbackError) {
        const errorMsg: Message = {
          id: Date.now().toString(),
          text: "I'm having a bit of trouble connecting to my brain right now. Please try again in a moment!",
          sender: 'bot',
          timestamp: Date.now()
        };
        setMessages(prev => [...prev, errorMsg]);
      }
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
