"use client";

import { useState, useRef, useEffect } from "react";
import {
  Lightbulb,
  MessageSquareDiff,
  Briefcase,
  Heart,
  Coffee,
  Wand2,
  Baby,
  Send,
  Loader2,
  RefreshCcw,
  Sparkles
} from "lucide-react";

type Mode = "idea" | "practice";
type PracticeCategory = "workplace" | "relationships" | "social" | "creative" | "parenting" | null;
type Message = { id: string, role: 'user' | 'assistant' | 'system', content: string };

const categories = [
  { id: "parenting", label: "Parent-Child", icon: Baby, color: "text-rose-500", bg: "bg-rose-50" },
  { id: "workplace", label: "Workplace", icon: Briefcase, color: "text-blue-500", bg: "bg-blue-50" },
  { id: "relationships", label: "Relationships", icon: Heart, color: "text-pink-500", bg: "bg-pink-50" },
  { id: "social", label: "Social Life", icon: Coffee, color: "text-amber-500", bg: "bg-amber-50" },
  { id: "creative", label: "Improv", icon: Wand2, color: "text-purple-500", bg: "bg-purple-50" },
] as const;

export function HeroClient() {
  const [mode, setMode] = useState<Mode>("idea");
  const [category, setCategory] = useState<PracticeCategory>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Custom local state to bypass buggy useChat hook completely
  const [myInput, setMyInput] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [isLocalLoading, setIsLocalLoading] = useState(false);

  const sendMessage = async (currentMessages: Message[], isInitial = false) => {
    setIsLocalLoading(true);
    const aiMessageId = Date.now().toString() + "-ai";
    setLocalMessages(prev => [...prev, { id: aiMessageId, role: 'assistant', content: '' }]);

    try {
      const response = await fetch("/api/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: currentMessages.map(m => ({ role: m.role, content: m.content })),
          context: mode === "practice" ? `practice-${category}` : "idea",
          isInitialPractice: isInitial
        }),
      });

      if (!response.ok) throw new Error(response.statusText);
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let assistantMessage = "";

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          
          // Vercel AI SDK streams data as `0:"text"` format
          // If we receive pure text instead (e.g. from mock), we fall back gracefully
          const lines = chunk.split('\n');
          for (const line of lines) {
             if (line.startsWith('0:')) {
                 try {
                    const textChunk = JSON.parse(line.slice(2));
                    assistantMessage += textChunk;
                 } catch (e) {
                  console.error(e);
                 }
             } else if (!line.startsWith('d:') && !line.startsWith('e:') && line.trim() !== '') {
                 // Raw text fallback
                 if (!line.includes(':')) {
                    assistantMessage += chunk;
                 }
             }
          }
          
          setLocalMessages(prev => 
             prev.map(m => m.id === aiMessageId ? { ...m, content: assistantMessage } : m)
          );
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setLocalMessages(prev => 
         prev.map(m => m.id === aiMessageId ? { ...m, content: "Sorry, I encountered an error connecting to the AI. Please try again." } : m)
      );
    } finally {
      setIsLocalLoading(false);
    }
  };

  const handleCustomSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!myInput.trim() || isLocalLoading) return;

    const newUserMessage: Message = { id: Date.now().toString(), role: "user", content: myInput };
    const updatedMessages = [...localMessages, newUserMessage];
    
    setLocalMessages(updatedMessages);
    setMyInput(""); // Clear the input
    
    sendMessage(updatedMessages, false);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    if (localMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [localMessages]);

  const handleModeChange = (newMode: Mode) => {
    setMode(newMode);
    setCategory(null);
    setLocalMessages([]);
    setMyInput("");
  };

  const handleCategorySelect = (selectedCategory: PracticeCategory) => {
    setCategory(selectedCategory);
    setLocalMessages([]);
    setMyInput("");
    
    // Auto-trigger the first message from AI for practice mode
    const initMsg: Message = { 
        id: "init", 
        role: "user", 
        content: "Please generate the first scenario statement for me in character. Just the statement, nothing else." 
    };
    // Don't show this hidden command to the user
    setLocalMessages([{ ...initMsg, content: "[Hidden System Command]" }]); 
    sendMessage([initMsg], true);
  };

  const visibleMessages = localMessages.filter(m => m.content !== "[Hidden System Command]");

  return (
    <div className="flex flex-col h-[600px] w-full rounded-[2.5rem] overflow-hidden border border-gray-200/60 bg-white/70 backdrop-blur-3xl shadow-2xl shadow-rose-500/5 relative font-sans">
      
      {/* Decorative Blur Orbs inside the box */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-rose-200 rounded-full mix-blend-multiply filter blur-[80px] opacity-40 -z-10 animate-blob" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-orange-200 rounded-full mix-blend-multiply filter blur-[80px] opacity-40 -z-10 animate-blob animation-delay-2000" />
      
      {/* Header / Mode Switcher */}
      <div className="flex p-3 bg-white/40 backdrop-blur-md border-b border-gray-100 z-10">
        <div className="flex w-full bg-gray-100/50 p-1 rounded-3xl">
          <button
            onClick={() => handleModeChange("idea")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-[1.2rem] text-sm font-semibold transition-all duration-300 ${
              mode === "idea"
                ? "bg-white text-orange-500 shadow-sm border border-gray-100"
                : "text-gray-500 hover:text-gray-700 hover:bg-white/40"
            }`}
          >
            <Lightbulb className="w-4 h-4" />
            Idea Inspiration
          </button>
          <button
            onClick={() => handleModeChange("practice")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-[1.2rem] text-sm font-semibold transition-all duration-300 ${
              mode === "practice"
                ? "bg-white text-rose-500 shadow-sm border border-gray-100"
                : "text-gray-500 hover:text-gray-700 hover:bg-white/40"
            }`}
          >
            <MessageSquareDiff className="w-4 h-4" />
            Scenario Practice
          </button>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 scroll-smooth z-10 relative">
        
        {/* Empty State / Welcome for IDEA mode */}
        {visibleMessages.length === 0 && mode === "idea" && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 animate-in fade-in zoom-in duration-500">
            <div className="relative">
              <div className="absolute inset-0 bg-orange-200 blur-2xl rounded-full" />
              <div className="relative w-24 h-24 rounded-full bg-linear-to-br from-white to-orange-50 border border-orange-100 flex items-center justify-center shadow-lg shadow-orange-500/10">
                <Lightbulb className="w-12 h-12 text-orange-400" />
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-2xl font-bold text-gray-800">Got a tricky situation?</h3>
              <p className="text-gray-500 text-base max-w-[80%] mx-auto leading-relaxed">
                Share what someone said or a challenge you&#39;re facing.<br/>
                I&#39;ll generate a few warm, &#34;Yes, And&#34; ways to respond.
              </p>
            </div>
          </div>
        )}

        {/* Categories for PRACTICE mode */}
        {visibleMessages.length === 0 && mode === "practice" && !category && (
          <div className="flex flex-col justify-center h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-center gap-2 mb-10">
              <Sparkles className="w-6 h-6 text-rose-400" />
              <h3 className="text-center text-lg font-bold text-gray-800">
                Choose a scenario to practice
              </h3>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 px-4 max-w-2xl mx-auto">
              {categories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id as PracticeCategory)}
                    className="flex flex-col items-center justify-center gap-3 p-6 rounded-4xl bg-white border border-gray-100 transition-all duration-300 hover:-translate-y-2 hover:shadow-xl hover:shadow-gray-200/50 group"
                  >
                    <div className={`p-4 rounded-full ${cat.bg} ${cat.color} group-hover:scale-110 transition-transform duration-300`}>
                      <Icon className="w-8 h-8" />
                    </div>
                    <span className="text-sm font-bold text-gray-600 group-hover:text-gray-900 transition-colors">
                      {cat.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Chat Messages */}
        {visibleMessages.map((m) => (
          <div
            key={m.id}
            className={`flex w-full animate-in fade-in slide-in-from-bottom-2 ${
              m.role === "user" ? "justify-end" : "justify-start"
            }`}
          >
            <div
              className={`max-w-[85%] px-6 py-4 text-[16px] leading-relaxed whitespace-pre-wrap shadow-sm ${
                m.role === "user"
                  ? "bg-linear-to-br from-orange-400 to-rose-400 text-white rounded-3xl rounded-tr-sm"
                  : "bg-white text-gray-700 rounded-3xl rounded-tl-sm border border-gray-100"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isLocalLoading && visibleMessages.length > 0 && visibleMessages[visibleMessages.length - 1].role === "user" && (
           <div className="flex justify-start w-full animate-pulse">
             <div className="bg-white rounded-3xl rounded-tl-sm px-6 py-4 border border-gray-100 flex items-center gap-3 shadow-sm">
               <Loader2 className="w-5 h-5 text-rose-400 animate-spin" />
               <span className="text-sm text-gray-500 font-medium">Drafting warmth...</span>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} className="h-6" />
      </div>

      {/* Input Form */}
      {!(mode === "practice" && !category && localMessages.length === 0) && (
        <div className="p-4 bg-white/60 backdrop-blur-xl border-t border-gray-100 z-10">
          <form
            onSubmit={handleCustomSubmit}
            className="flex items-end gap-3 bg-white rounded-3xl p-2 pr-3 border border-gray-200 focus-within:border-orange-300 focus-within:ring-4 focus-within:ring-orange-100/50 transition-all shadow-sm"
          >
            {mode === 'practice' && category && (
               <button
                 type="button"
                 onClick={() => {
                   setCategory(null);
                   setLocalMessages([]);
                 }}
                 className="p-4 text-gray-400 hover:text-rose-500 transition-colors rounded-2xl hover:bg-rose-50 mb-1 ml-1"
                 title="Change Category"
               >
                 <RefreshCcw className="w-5 h-5" />
               </button>
            )}
            <textarea
             className="flex-1 bg-transparent border-none outline-none text-[16px] text-gray-800 px-4 py-4 placeholder:text-gray-400 resize-none min-h-[56px] max-h-[150px]"
             rows={1}
             value={myInput}
             placeholder={
               mode === "idea"
                 ? "E.g., My boss wants this done by tonight..."
                 : "Type your 'Yes, And' response..."
             }
             onChange={(e) => {
               setMyInput(e.target.value);
               e.target.style.height = 'auto';
               e.target.style.height = e.target.scrollHeight + 'px';
             }}
             onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  const fakeEvent = { preventDefault: () => {} } as React.FormEvent<HTMLFormElement>;
                  handleCustomSubmit(fakeEvent);
                }
             }}
             disabled={isLocalLoading || (mode === 'practice' && localMessages.length === 0)}
            />
            <button
             type="submit"
             disabled={isLocalLoading || (!myInput.trim() && !(mode === 'practice' && localMessages.length === 0))}
             className="p-4 rounded-2xl bg-linear-to-br from-orange-400 to-rose-400 text-white hover:shadow-lg hover:shadow-rose-400/40 disabled:opacity-40 disabled:hover:shadow-none transition-all group mb-1"
            >              <Send className="w-5 h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </form>
          <div className="text-center mt-3">
             <span className="text-[11px] font-medium text-gray-400 tracking-wide uppercase">Press Enter to send, Shift+Enter for new line</span>
          </div>
        </div>
      )}
    </div>
  );
}
