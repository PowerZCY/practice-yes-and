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
  Sparkles,
  History,
  Trash2,
  X,
  Plus
} from "lucide-react";

type Mode = "idea" | "practice";
type PracticeCategory = "workplace" | "relationships" | "social" | "creative" | "parenting" | null;
type Message = { id: string, role: 'user' | 'assistant' | 'system', content: string };

type Session = {
  id: string;
  mode: Mode;
  category: PracticeCategory;
  messages: Message[];
  updatedAt: number;
};

const categories = [
  { id: "parenting", label: "Parent-Child", icon: Baby, color: "text-rose-500", bg: "bg-rose-50" },
  { id: "workplace", label: "Workplace", icon: Briefcase, color: "text-blue-500", bg: "bg-blue-50" },
  { id: "relationships", label: "Relationships", icon: Heart, color: "text-pink-500", bg: "bg-pink-50" },
  { id: "social", label: "Social Life", icon: Coffee, color: "text-amber-500", bg: "bg-amber-50" },
  { id: "creative", label: "Improv", icon: Wand2, color: "text-purple-500", bg: "bg-purple-50" },
] as const;


const TooltipTop = ({ children, text }: { children: React.ReactNode, text: string }) => (
  <div className="relative group/tooltip flex">
    {children}
    <div className="absolute bottom-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-white/95 border border-gray-100 backdrop-blur-md text-gray-600 text-xs font-bold rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-xl shadow-gray-200/40 z-50 scale-95 group-hover/tooltip:scale-100">
      {text}
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white/95" />
    </div>
  </div>
);

const TooltipBottom = ({ children, text }: { children: React.ReactNode, text: string }) => (
  <div className="relative group/tooltip flex">
    {children}
    <div className="absolute top-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-white/95 border border-gray-100 backdrop-blur-md text-gray-600 text-xs font-bold rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-xl shadow-gray-200/40 z-50 scale-95 group-hover/tooltip:scale-100">
      {text}
      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-b-white/95" />
    </div>
  </div>
);

const TooltipLeft = ({ children, text, className }: { children: React.ReactNode, text: string, className?: string }) => (
  <div className={`relative group/tooltip flex ${className || ''}`}>
    {children}
    <div className="absolute right-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-gray-900/95 text-white text-xs font-medium rounded-lg opacity-0 group-hover/tooltip:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-xl z-50 scale-95 group-hover/tooltip:scale-100">
      {text}
      <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 border-4 border-transparent border-l-gray-900/95" />
    </div>
  </div>
);

export function HeroClient() {
  const [mode, setMode] = useState<Mode>("idea");
  const [category, setCategory] = useState<PracticeCategory>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [myInput, setMyInput] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [isLocalLoading, setIsLocalLoading] = useState(false);

  // History states
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Load sessions from localStorage on mount
  useEffect(() => {
    setCurrentSessionId(Date.now().toString());
    const saved = localStorage.getItem("yes-and-sessions");
    if (saved) {
      try {
        setSessions(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse sessions", e);
      }
    }
  }, []);

  // Save session when messages update
  useEffect(() => {
    if (currentSessionId && localMessages.some(m => !m.content.includes('[Hidden'))) {
      setSessions(prev => {
        const existingIdx = prev.findIndex(s => s.id === currentSessionId);
        const newSession: Session = {
          id: currentSessionId,
          mode,
          category,
          messages: localMessages,
          updatedAt: Date.now()
        };
        
        let newSessions;
        if (existingIdx >= 0) {
          newSessions = [...prev];
          newSessions[existingIdx] = newSession;
        } else {
          newSessions = [newSession, ...prev];
        }
        localStorage.setItem("yes-and-sessions", JSON.stringify(newSessions));
        return newSessions;
      });
    }
  }, [localMessages, currentSessionId, mode, category]);

  const startNewSession = (newMode: Mode, newCategory: PracticeCategory = null) => {
    setMode(newMode);
    setCategory(newCategory);
    setLocalMessages([]);
    setMyInput("");
    setCurrentSessionId(Date.now().toString());
  };

  const loadSession = (session: Session) => {
    setMode(session.mode);
    setCategory(session.category);
    setLocalMessages(session.messages);
    setCurrentSessionId(session.id);
    setShowHistory(false);
  };

  const deleteSession = (id: string) => {
    setSessions(prev => {
       const newS = prev.filter(s => s.id !== id);
       localStorage.setItem("yes-and-sessions", JSON.stringify(newS));
       return newS;
    });
    if (currentSessionId === id) {
       startNewSession(mode, null);
    }
  };

  const getSessionPreview = (session: Session) => {
    const firstRealMsg = session.messages.find(m => m.role === 'user' && !m.content.includes('[Hidden'));
    if (firstRealMsg) return firstRealMsg.content;
    const assistantMsg = session.messages.find(m => m.role === 'assistant');
    if (assistantMsg) return assistantMsg.content;
    return 'Empty conversation';
  };

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
    setMyInput(""); 
    
    sendMessage(updatedMessages, false);
  };

  useEffect(() => {
    if (localMessages.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [localMessages]);

  const handleModeChange = (newMode: Mode) => {
    if (newMode !== mode) {
      startNewSession(newMode, null);
    }
  };

  const handleCategorySelect = (selectedCategory: PracticeCategory) => {
    startNewSession("practice", selectedCategory);
    
    const initMsg: Message = { 
        id: "init", 
        role: "user", 
        content: "Please generate the first scenario statement for me in character. Just the statement, nothing else." 
    };
    setLocalMessages([{ ...initMsg, content: "[Hidden System Command]" }]); 
    sendMessage([initMsg], true);
  };

  const visibleMessages = localMessages.filter(m => !m.content.includes("[Hidden System Command]"));
  const sortedSessions = [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);

  return (
    <div className="flex flex-col h-[680px] w-full rounded-[2.5rem] overflow-hidden border border-gray-200/60 bg-white/70 backdrop-blur-3xl shadow-2xl shadow-rose-500/5 relative font-sans">
      
      {/* Decorative Blur Orbs inside the box */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-rose-200/50 rounded-full mix-blend-multiply filter blur-[80px] opacity-60 -z-10 animate-blob" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-orange-200/50 rounded-full mix-blend-multiply filter blur-[80px] opacity-60 -z-10 animate-blob animation-delay-2000" />
      
      {/* Header / Mode Switcher */}
      <div className="flex p-3 bg-white/40 backdrop-blur-md border-b border-gray-100 z-10 items-center gap-2">
        <div className="flex flex-1 bg-gray-100/50 p-1 rounded-3xl">
          <button
            onClick={() => handleModeChange("idea")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-[1.2rem] text-sm font-semibold transition-all duration-300 ${
              mode === "idea"
                ? "bg-white text-orange-500 shadow-sm border border-gray-100"
                : "text-gray-500 hover:text-gray-700 hover:bg-white/40"
            }`}
          >
            <Lightbulb className="w-4 h-4" />
            <span className="hidden sm:inline">Idea Inspiration</span>
            <span className="sm:hidden">Idea</span>
          </button>
          <button
            onClick={() => handleModeChange("practice")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-[1.2rem] text-sm font-semibold transition-all duration-300 ${
              mode === "practice"
                ? "bg-white text-rose-500 shadow-sm border border-gray-100"
                : "text-gray-500 hover:text-gray-700 hover:bg-white/40"
            }`}
          >
            <MessageSquareDiff className="w-4 h-4" />
            <span className="hidden sm:inline">Scenario Practice</span>
            <span className="sm:hidden">Practice</span>
          </button>
        </div>

        <div className="flex items-center gap-1 bg-gray-100/50 p-1 rounded-3xl">
          <TooltipBottom text="New Chat">
            <button 
              onClick={() => startNewSession(mode, mode === "practice" && !category ? null : category)} 
              className="p-2.5 rounded-[1.2rem] bg-transparent text-gray-500 hover:text-orange-500 hover:bg-white hover:shadow-sm transition-all" 
            >
              <Plus className="w-4 h-4" />
            </button>
          </TooltipBottom>
          <TooltipBottom text="History">
            <button 
              onClick={() => setShowHistory(true)} 
              className="p-2.5 rounded-[1.2rem] bg-transparent text-gray-500 hover:text-rose-500 hover:bg-white hover:shadow-sm transition-all" 
            >
              <History className="w-4 h-4" />
            </button>
          </TooltipBottom>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth z-10 relative flex flex-col">
        
        {/* Empty State / Welcome for IDEA mode */}
        {visibleMessages.length === 0 && mode === "idea" && (
          <div className="flex flex-col items-center justify-center m-auto text-center space-y-6 animate-in fade-in zoom-in duration-500 py-10">
            <div className="relative">
              <div className="absolute inset-0 bg-orange-200 blur-2xl rounded-full" />
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-linear-to-br from-white to-orange-50 border border-orange-100 flex items-center justify-center shadow-lg shadow-orange-500/10">
                <Lightbulb className="w-10 h-10 sm:w-12 sm:h-12 text-orange-400" />
              </div>
            </div>
            <div className="space-y-3">
              <h3 className="text-xl sm:text-2xl font-bold text-gray-800">Got a tricky situation?</h3>
              <p className="text-gray-500 text-sm sm:text-base max-w-[90%] sm:max-w-[80%] mx-auto leading-relaxed">
                Share what someone said or a challenge you&#39;re facing.<br/>
                I&#39;ll generate a few warm, &#34;Yes, And&#34; ways to respond.
              </p>
            </div>
          </div>
        )}

        {/* Categories for PRACTICE mode */}
        {visibleMessages.length === 0 && mode === "practice" && !category && (
          <div className="flex flex-col justify-center m-auto animate-in fade-in slide-in-from-bottom-4 duration-500 py-10">
            <div className="flex items-center justify-center gap-2 mb-8">
              <Sparkles className="w-6 h-6 text-rose-400" />
              <h3 className="text-center text-lg font-bold text-gray-800">
                Choose a scenario to practice
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 px-2 sm:px-4 max-w-2xl mx-auto">
              {categories.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() => handleCategorySelect(cat.id as PracticeCategory)}
                    className="flex flex-col items-center justify-center gap-3 p-4 sm:p-6 rounded-4xl bg-white/80 backdrop-blur-sm border border-gray-100 transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl hover:shadow-rose-500/10 hover:border-rose-100 group"
                  >
                    <div className={`p-3 sm:p-4 rounded-full ${cat.bg} ${cat.color} group-hover:scale-110 transition-transform duration-300 shadow-sm`}>
                      <Icon className="w-6 h-6 sm:w-8 sm:h-8" />
                    </div>
                    <span className="text-xs sm:text-sm font-bold text-gray-600 group-hover:text-gray-900 transition-colors">
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
              className={`max-w-[85%] px-5 sm:px-6 py-3.5 sm:py-4 text-[15px] sm:text-[16px] leading-relaxed whitespace-pre-wrap shadow-sm ${
                m.role === "user"
                  ? "bg-linear-to-br from-orange-400 to-rose-400 text-white rounded-3xl rounded-tr-sm shadow-orange-500/20"
                  : "bg-white/90 backdrop-blur-sm text-gray-700 rounded-3xl rounded-tl-sm border border-gray-100 shadow-gray-200/50"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {/* Loading Indicator */}
        {isLocalLoading && (
           <div className="flex justify-start w-full animate-in fade-in slide-in-from-left-2 duration-300">
             <div className="bg-white/80 backdrop-blur-sm rounded-3xl rounded-tl-sm px-6 py-4 border border-gray-100 flex items-center gap-3 shadow-sm shadow-rose-500/5">
               <div className="flex gap-1">
                 <div className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                 <div className="w-1.5 h-1.5 bg-orange-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                 <div className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce"></div>
               </div>
               <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">AI is thinking</span>
             </div>
           </div>
        )}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Input Form */}
      {!(mode === "practice" && !category && localMessages.length === 0) && (
        <div className="p-3 sm:p-4 bg-white/60 backdrop-blur-xl border-t border-gray-100 z-10">
          <form
            onSubmit={handleCustomSubmit}
            className="flex items-end gap-2 sm:gap-3 bg-white rounded-3xl p-1.5 sm:p-2 pr-2 sm:pr-3 border border-gray-200 focus-within:border-orange-300 focus-within:ring-4 focus-within:ring-orange-100/50 transition-all shadow-sm"
          >
            {mode === 'practice' && category && (
               <TooltipTop text="Change Category">
               <button
                 type="button"
                 onClick={() => {
                   startNewSession("practice", null);
                 }}
                 className="p-3 sm:p-4 text-gray-400 hover:text-rose-500 transition-colors rounded-[1.2rem] hover:bg-rose-50 mb-0.5 ml-0.5"
               >
                 <RefreshCcw className="w-4 h-4 sm:w-5 sm:h-5" />
               </button>
             </TooltipTop>
            )}
            <textarea
             className="flex-1 bg-transparent border-none outline-none text-[15px] sm:text-[16px] text-gray-800 px-3 sm:px-4 py-3 sm:py-4 placeholder:text-gray-400 resize-none min-h-[50px] sm:min-h-[56px] max-h-[120px] sm:max-h-[150px]"
             rows={1}
             value={myInput}
             placeholder={
               isLocalLoading 
                 ? "AI is responding..." 
                 : mode === "idea"
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
             className={`p-3 sm:p-4 rounded-[1.2rem] bg-linear-to-br from-orange-400 to-rose-400 text-white hover:shadow-lg hover:shadow-rose-400/40 disabled:opacity-40 disabled:hover:shadow-none transition-all group mb-0.5 ${isLocalLoading ? 'animate-pulse' : ''}`}
            >
              {isLocalLoading ? (
                <Loader2 className="w-4 h-4 sm:w-5 sm:h-5 animate-spin" />
              ) : (
                <Send className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              )}
            </button>
          </form>
          <div className="text-center mt-2.5">
             <span className="text-[10px] sm:text-[11px] font-medium text-gray-400 tracking-wide uppercase">Press Enter to send, Shift+Enter for new line</span>
          </div>
        </div>
      )}

      {/* History Slide-over Panel */}
      {showHistory && (
        <div className="absolute inset-0 bg-gray-900/10 backdrop-blur-[2px] z-50 flex justify-end animate-in fade-in duration-200">
          <div className="w-full sm:w-[360px] h-full bg-white/95 backdrop-blur-xl border-l border-gray-100 shadow-2xl flex flex-col animate-in slide-in-from-right-full duration-300">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100/80 bg-white/50">
              <h2 className="text-[1.1rem] font-bold flex items-center gap-2 text-gray-800">
                <History className="w-5 h-5 text-rose-400" />
                Your History
              </h2>
              <button onClick={() => setShowHistory(false)} className="p-2 rounded-full hover:bg-rose-50 hover:text-rose-500 text-gray-400 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 scroll-smooth">
               {sortedSessions.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-4 opacity-60">
                     <History className="w-12 h-12" />
                     <p className="text-sm font-medium">No past conversations yet.</p>
                  </div>
               ) : (
                  sortedSessions.map(session => (
                     <div 
                        key={session.id} 
                        onClick={() => loadSession(session)} 
                        className="group p-4 rounded-2xl border border-gray-100 bg-white hover:border-rose-200 hover:shadow-lg hover:shadow-rose-500/5 transition-all cursor-pointer flex flex-col gap-2.5 relative overflow-hidden"
                     >
                        <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-700">
                           <div className={`p-1.5 rounded-lg ${session.mode === 'idea' ? 'bg-orange-50 text-orange-500' : 'bg-rose-50 text-rose-500'}`}>
                             {session.mode === 'idea' ? <Lightbulb className="w-3.5 h-3.5"/> : <MessageSquareDiff className="w-3.5 h-3.5" />}
                           </div>
                           {session.mode === 'idea' ? 'Idea Inspiration' : categories.find(c => c.id === session.category)?.label || 'Practice'}
                           <span className="text-[11px] text-gray-400 font-medium ml-auto">
                              {new Date(session.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                           </span>
                        </div>
                        <p className="text-[13px] text-gray-500 line-clamp-2 pr-6 leading-relaxed">
                           {getSessionPreview(session)}
                        </p>
                        <TooltipLeft text="Delete" className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-all">
                           <button 
                              onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }} 
                              className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 bg-white rounded-full shadow-sm"
                           >
                              <Trash2 className="w-4 h-4" />
                           </button>
                        </TooltipLeft>
                     </div>
                  ))
               )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
