"use client";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@clerk/nextjs";
import {
  Lightbulb,
  CircleStop,
  Heart,
  X,
  Pencil,

  MessageSquareDiff,
  Briefcase,
  Coffee,
  Wand2,
  Baby,
  Send,
  RefreshCcw,
  Sparkles,
  History,
  Trash2,
  Plus,
  Pin
} from "lucide-react";
import {
  buildConversationWindow,
  DEFAULT_CONTEXT_WINDOW_TURNS,
  getSessionDisplayTitle,
  getSessionPreview,
  HIDDEN_SYSTEM_COMMAND,
  isHiddenSessionMessage,
  type Message,
  type Mode,
  type PracticeCategory,
  type Session,
} from "@/lib/chatSession";
import { appConfig } from "@/lib/appConfig";
import {
  ASSISTANT_STATUS_COPY,
  PRACTICE_INITIAL_USER_PROMPT,
} from "@/lib/ai-generate-content";

const categories = [
  { id: "parenting", label: "Parent-Child", icon: Baby, color: "text-rose-500", bg: "bg-rose-50" },
  { id: "workplace", label: "Workplace", icon: Briefcase, color: "text-blue-500", bg: "bg-blue-50" },
  { id: "relationships", label: "Relationships", icon: Heart, color: "text-pink-500", bg: "bg-pink-50" },
  { id: "social", label: "Social Life", icon: Coffee, color: "text-amber-500", bg: "bg-amber-50" },
  { id: "creative", label: "Improv", icon: Wand2, color: "text-purple-500", bg: "bg-purple-50" },
] as const;

const DEBUG_ASSISTANT_STATUS_LABELS = {
  streaming: "Streaming",
  completed: "Completed",
  stopped: "Stopped",
  timeout: "Timed out",
  request_aborted: "Aborted",
  upstream_interrupted: "Interrupted",
} as const;

function formatDuration(durationMs?: number) {
  if (typeof durationMs !== "number" || !Number.isFinite(durationMs) || durationMs < 0) {
    return "--";
  }

  if (durationMs < 1000) {
    return `${Math.round(durationMs)}ms`;
  }

  return `${(durationMs / 1000).toFixed(1)}s`;
}

function getAssistantDebugStatus(status?: Message["status"]) {
  return status ? DEBUG_ASSISTANT_STATUS_LABELS[status] : "Completed";
}

function getAssistantDebugStatusClass(status?: Message["status"]) {
  switch (status) {
    case "completed":
    case undefined:
      return "text-emerald-600";
    case "streaming":
      return "text-amber-500";
    case "stopped":
    case "timeout":
    case "request_aborted":
    case "upstream_interrupted":
      return "text-rose-500";
    default:
      return "text-gray-500";
  }
}

function getAssistantStatusCopy(status?: Message["status"]) {
  if (status === "stopped") {
    return ASSISTANT_STATUS_COPY.stopped;
  }

  if (status === "timeout") {
    return ASSISTANT_STATUS_COPY.timeout;
  }

  if (status === "request_aborted") {
    return ASSISTANT_STATUS_COPY.requestAborted;
  }

  if (status === "upstream_interrupted") {
    return ASSISTANT_STATUS_COPY.upstreamInterrupted;
  }

  return null;
}

function renderAssistantMeta(message: Message, isDebugEnabled: boolean) {
  if (message.role !== "assistant") {
    return null;
  }

  const isWaitingForFirstToken =
    message.status === "streaming" &&
    !message.content.trim() &&
    message.firstTokenLatencyMs === undefined;

  if (isWaitingForFirstToken) {
    return (
      <div className="mt-3 flex items-center gap-2.5 text-[11px] font-medium text-amber-500 sm:text-xs">
        <div className="flex gap-1">
          <div className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-bounce [animation-delay:-0.3s]" />
          <div className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-bounce [animation-delay:-0.15s]" />
          <div className="h-1.5 w-1.5 rounded-full bg-rose-400 animate-bounce" />
        </div>
        <span className="uppercase tracking-wider text-gray-400">AI is thinking</span>
      </div>
    );
  }

  if (isDebugEnabled) {
    const firstTokenText =
      message.status === "streaming" && message.firstTokenLatencyMs === undefined
        ? "waiting..."
        : formatDuration(message.firstTokenLatencyMs);

    const totalDurationMs =
      message.status === "streaming" && typeof message.requestedAt === "number"
        ? Date.now() - message.requestedAt
        : message.totalDurationMs;

    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-gray-400 sm:text-xs">
        <span>{`First token ${firstTokenText}`}</span>
        <span aria-hidden="true" className="text-gray-300">·</span>
        <span>{`Total ${formatDuration(totalDurationMs)}`}</span>
        <span aria-hidden="true" className="text-gray-300">·</span>
        <span className={getAssistantDebugStatusClass(message.status)}>
          {getAssistantDebugStatus(message.status)}
        </span>
      </div>
    );
  }

  const statusCopy = getAssistantStatusCopy(message.status);
  if (!statusCopy) {
    return null;
  }

  return (
    <div className="mt-3 text-xs font-medium text-rose-500">
      {statusCopy}
    </div>
  );
}


const TooltipTop = ({ children, text, className }: { children: React.ReactNode, text: string, className?: string }) => (
  <div className={`relative group/tooltip flex ${className || ''}`}>
    {children}
    <div className="absolute bottom-[calc(100%+0.5rem)] left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-white/95 border border-gray-100 backdrop-blur-md text-gray-700 text-xs font-bold rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-xl shadow-gray-200/40 z-50 scale-95 group-hover/tooltip:scale-100">
      {text}
      <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 border-4 border-transparent border-t-white/95" />
    </div>
  </div>
);

const TooltipBottom = ({ children, text, className }: { children: React.ReactNode, text: string, className?: string }) => (
  <div className={`relative group/tooltip flex ${className || ''}`}>
    {children}
    <div className="absolute top-[calc(100%+0.4rem)] left-1/2 -translate-x-1/2 px-2.5 py-1.5 bg-white/95 border border-gray-100 backdrop-blur-md text-gray-700 text-xs font-bold rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-xl shadow-gray-200/40 z-60 scale-95 group-hover/tooltip:scale-100">
      {text}
    </div>
  </div>
);

const TooltipLeft = ({ children, text, className }: { children: React.ReactNode, text: string, className?: string }) => (
  <div className={`relative group/tooltip flex ${className || ''}`}>
    {children}
    <div className="absolute right-[calc(100%+0.5rem)] top-1/2 -translate-y-1/2 px-2.5 py-1.5 bg-white/95 border border-gray-100 backdrop-blur-md text-gray-700 text-xs font-bold rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-all duration-200 pointer-events-none whitespace-nowrap shadow-xl shadow-gray-200/40 z-60 scale-95 group-hover/tooltip:scale-100">
      {text}
      <div className="absolute top-1/2 -right-1.5 -translate-y-1/2 border-4 border-transparent border-l-white/95" />
    </div>
  </div>
);

function createSessionId() {
  return crypto.randomUUID();
}

function sortSessions(sessions: Session[]) {
  return [...sessions].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return Number(b.isPinned) - Number(a.isPinned);
    }

    return b.updatedAt - a.updatedAt;
  });
}

export function HeroClient({
  initialSessions,
  initialIsSignedIn,
}: {
  initialSessions: Session[];
  initialIsSignedIn: boolean;
}) {
  const { isLoaded, isSignedIn } = useAuth();
  const [mode, setMode] = useState<Mode>("idea");
  const [category, setCategory] = useState<PracticeCategory>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const previousIsSignedInRef = useRef<boolean | null>(null);
  const requestAbortControllerRef = useRef<AbortController | null>(null);
  
  const [myInput, setMyInput] = useState("");
  const [localMessages, setLocalMessages] = useState<Message[]>([]);
  const [isLocalLoading, setIsLocalLoading] = useState(false);

  // History states
  const [sessions, setSessions] = useState<Session[]>(
    initialIsSignedIn ? initialSessions : [],
  );
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(createSessionId);
  const [showHistory, setShowHistory] = useState(false);
  const [isHistoryReady, setIsHistoryReady] = useState(false);
  const [currentSessionName, setCurrentSessionName] = useState<string | null>(null);
  const [currentSessionPinned, setCurrentSessionPinned] = useState(false);
  const [renamingSessionId, setRenamingSessionId] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState("");
  const isOpenRouterDebug = appConfig.openrouterAI.debug;

  const abortActiveRequest = (reason: string = "user") => {
    requestAbortControllerRef.current?.abort(reason);
    requestAbortControllerRef.current = null;
  };

  const resetConversation = (nextMode: Mode = mode, nextCategory: PracticeCategory = category) => {
    abortActiveRequest();
    setMode(nextMode);
    setCategory(nextCategory);
    setLocalMessages([]);
    setMyInput("");
    setCurrentSessionName(null);
    setCurrentSessionPinned(false);
    setCurrentSessionId(createSessionId());
    setShowHistory(false);
    setRenamingSessionId(null);
    setRenamingValue("");
  };

  useEffect(() => {
    if (!isLoaded) {
      return;
    }

    const previousIsSignedIn = previousIsSignedInRef.current;
    previousIsSignedInRef.current = isSignedIn;

    if (previousIsSignedIn === null) {
      setSessions(isSignedIn ? sortSessions(initialSessions) : []);
      setIsHistoryReady(!isSignedIn || initialSessions.length > 0);
      return;
    }

    if (previousIsSignedIn !== isSignedIn) {
      abortActiveRequest();
      setLocalMessages([]);
      setMyInput("");
      setCurrentSessionName(null);
      setCurrentSessionPinned(false);
      setCurrentSessionId(createSessionId());
      setShowHistory(false);
      setRenamingSessionId(null);
      setRenamingValue("");
      setSessions([]);
      setIsHistoryReady(!isSignedIn);
    }
  }, [initialSessions, isLoaded, isSignedIn]);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) {
      return;
    }

    let isMounted = true;

    const loadSessions = async () => {
      setIsHistoryReady(false);

      try {
        const response = await fetch("/api/chat-sessions", { cache: "no-store" });
        if (!response.ok) {
          throw new Error(response.statusText);
        }

        const data = (await response.json()) as { sessions?: Session[] };
        if (isMounted && Array.isArray(data.sessions)) {
          setSessions(sortSessions(data.sessions));
          setIsHistoryReady(true);
        }
      } catch (error) {
        console.error("Failed to load chat sessions", error);
        if (isMounted) {
          setSessions([]);
          setIsHistoryReady(true);
        }
      }
    };

    loadSessions();

    return () => {
      isMounted = false;
    };
  }, [isLoaded, isSignedIn]);

  useEffect(() => {
    const hasPersistableMessages = localMessages.some(
      (message) => !isHiddenSessionMessage(message) && message.content.trim(),
    );

    if (!currentSessionId || !hasPersistableMessages || !isHistoryReady) {
      return;
    }

    const updatedSession: Session = {
      id: currentSessionId,
      mode,
      category,
      messages: localMessages,
      isPinned: currentSessionPinned,
      sessionName: currentSessionName,
      updatedAt: Date.now(),
    };

    setSessions((prev) => {
      const withoutCurrent = prev.filter((session) => session.id !== currentSessionId);
      return sortSessions([updatedSession, ...withoutCurrent]);
    });

    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/chat-sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedSession),
        });

        if (!response.ok) {
          throw new Error(response.statusText);
        }
      } catch (error) {
        console.error("Failed to persist chat session", error);
      }
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    localMessages,
    currentSessionId,
    mode,
    category,
    isHistoryReady,
    currentSessionPinned,
    currentSessionName,
  ]);

  const startNewSession = (newMode: Mode, newCategory: PracticeCategory = null) => {
    resetConversation(newMode, newCategory);
  };

  const loadSession = (session: Session) => {
    abortActiveRequest();
    setMode(session.mode);
    setCategory(session.category);
    setLocalMessages(session.messages);
    setCurrentSessionName(session.sessionName);
    setCurrentSessionPinned(session.isPinned);
    setCurrentSessionId(session.id);
    setShowHistory(false);
  };

  const deleteSession = (id: string) => {
    setSessions(prev => prev.filter(s => s.id !== id));

    void fetch("/api/chat-sessions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: id }),
    }).catch((error) => {
      console.error("Failed to delete chat session", error);
    });

    if (currentSessionId === id) {
       startNewSession(mode, null);
    }
  };

  const patchSession = async (payload: {
    sessionId: string;
    isPinned?: boolean;
    sessionName?: string | null;
  }) => {
    const response = await fetch("/api/chat-sessions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(response.statusText);
    }
  };

  const togglePinSession = (session: Session) => {
    const nextPinned = !session.isPinned;

    setSessions((prev) =>
      sortSessions(
        prev.map((item) =>
          item.id === session.id
            ? { ...item, isPinned: nextPinned, updatedAt: Date.now() }
            : item,
        ),
      ),
    );

    if (currentSessionId === session.id) {
      setCurrentSessionPinned(nextPinned);
    }

    void patchSession({ sessionId: session.id, isPinned: nextPinned }).catch((error) => {
      console.error("Failed to update pin state", error);
      setSessions((prev) =>
        sortSessions(
          prev.map((item) =>
            item.id === session.id ? { ...item, isPinned: session.isPinned } : item,
          ),
        ),
      );

      if (currentSessionId === session.id) {
        setCurrentSessionPinned(session.isPinned);
      }
    });
  };

  const startRenamingSession = (session: Session) => {
    setRenamingSessionId(session.id);
    setRenamingValue(session.sessionName ?? "");
  };

  const submitRenameSession = (session: Session) => {
    const nextName = renamingValue.trim() || null;
    setRenamingSessionId(null);
    setRenamingValue("");

    setSessions((prev) =>
      sortSessions(
        prev.map((item) =>
          item.id === session.id ? { ...item, sessionName: nextName } : item,
        ),
      ),
    );

    if (currentSessionId === session.id) {
      setCurrentSessionName(nextName);
    }

    void patchSession({ sessionId: session.id, sessionName: nextName }).catch((error) => {
      console.error("Failed to rename session", error);
      setSessions((prev) =>
        sortSessions(
          prev.map((item) =>
            item.id === session.id ? { ...item, sessionName: session.sessionName } : item,
          ),
        ),
      );

      if (currentSessionId === session.id) {
        setCurrentSessionName(session.sessionName);
      }
    });
  };

  const cancelRenameSession = () => {
    setRenamingSessionId(null);
    setRenamingValue("");
  };

  const sendMessage = async (currentMessages: Message[], isInitial = false) => {
    abortActiveRequest();
    setIsLocalLoading(true);
    const aiMessageId = Date.now().toString() + "-ai";
    const requestStartedAt = Date.now();
    const abortController = new AbortController();
    requestAbortControllerRef.current = abortController;
    setLocalMessages(prev => [
      ...prev,
      {
        id: aiMessageId,
        role: 'assistant',
        content: '',
        status: "streaming",
        requestedAt: requestStartedAt,
      },
    ]);

    try {
      const requestMessages = buildConversationWindow(
        currentMessages,
        appConfig.openrouterAI.contextWindowTurns || DEFAULT_CONTEXT_WINDOW_TURNS,
      );

      const response = await fetch("/api/ai-generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: requestMessages.map(m => ({ role: m.role, content: m.content })),
          context: mode === "practice" ? `practice-${category}` : "idea",
          isInitialPractice: isInitial,
          sessionId: currentSessionId,
        }),
        signal: abortController.signal,
      });

      if (!response.ok) {
        let responseError = "";

        try {
          const errorBody = (await response.json()) as { error?: string };
          responseError = errorBody.error || "";
        } catch {
          responseError = "";
        }

        const error = new Error(responseError || response.statusText);
        error.name = "AIRequestError";
        throw error;
      }
      if (!response.body) throw new Error("No response body");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const mockStreamError = response.headers.get("X-AI-Stream-Error");
      let assistantMessage = "";
      let firstTokenAt: number | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        if (value) {
          if (firstTokenAt === undefined) {
            firstTokenAt = Date.now();
          }
          const currentFirstTokenAt = firstTokenAt;

          assistantMessage += decoder.decode(value, { stream: true });

          setLocalMessages(prev =>
            prev.map(m => m.id === aiMessageId ? {
              ...m,
              content: assistantMessage,
              status: "streaming",
              requestedAt: m.requestedAt ?? requestStartedAt,
              firstTokenAt: m.firstTokenAt ?? currentFirstTokenAt,
              firstTokenLatencyMs:
                m.firstTokenLatencyMs ?? (currentFirstTokenAt - (m.requestedAt ?? requestStartedAt)),
            } : m)
          );
        }
      }

      assistantMessage += decoder.decode();
      const finishedAt = Date.now();

      setLocalMessages((prev) =>
        prev.map((message) => {
          if (message.id !== aiMessageId) {
            return message;
          }

          return {
            ...message,
            content: assistantMessage,
            finishedAt,
            totalDurationMs: finishedAt - (message.requestedAt ?? requestStartedAt),
            status:
              mockStreamError === "timeout"
                ? "timeout"
                : mockStreamError === "request_aborted"
                  ? "request_aborted"
                  : mockStreamError === "upstream_interrupted"
                    ? "upstream_interrupted"
                    : "completed",
          };
        }),
      );
    } catch (error) {
      if (abortController.signal.aborted) {
      const finishedAt = Date.now();
      setLocalMessages((prev) =>
        prev.map((message) => {
          if (message.id !== aiMessageId) {
            return message;
          }

          const normalizedContent = message.content.trim();
          return {
            ...message,
            content: normalizedContent,
            finishedAt,
            totalDurationMs: finishedAt - (message.requestedAt ?? requestStartedAt),
            status:
              abortController.signal.reason === "user"
                ? "stopped"
                : abortController.signal.reason === "timeout"
                  ? "timeout"
                  : "request_aborted",
          };
        }),
      );
      return;
    }

      const finishedAt = Date.now();
      setLocalMessages((prev) =>
        prev.map((message) => {
          if (message.id !== aiMessageId) {
            return message;
          }

          const normalizedContent = message.content.trim();
          return {
            ...message,
            content: normalizedContent,
            finishedAt,
            totalDurationMs: finishedAt - (message.requestedAt ?? requestStartedAt),
            status:
              error instanceof Error && error.message === "timeout"
                ? "timeout"
                : error instanceof Error && error.message === "request_aborted"
                  ? "request_aborted"
                  : "upstream_interrupted",
          };
        }),
      );

      console.error("Chat error:", error);
    } finally {
      if (requestAbortControllerRef.current === abortController) {
        requestAbortControllerRef.current = null;
      }
      setIsLocalLoading(false);
    }
  };

  useEffect(() => {
    return () => {
      abortActiveRequest();
    };
  }, []);

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
        content: PRACTICE_INITIAL_USER_PROMPT,
    };
    setLocalMessages([{ ...initMsg, content: HIDDEN_SYSTEM_COMMAND }]); 
    sendMessage([initMsg], true);
  };

  const visibleMessages = localMessages.filter((message) => !isHiddenSessionMessage(message));
  const sortedSessions = sortSessions(sessions);
  const canShowHistory = Boolean(isLoaded && isSignedIn);

  return (
    <div className="relative flex h-[680px] w-full max-w-none flex-col overflow-hidden rounded-[2.5rem] border border-amber-100/80 bg-[linear-gradient(180deg,rgba(255,252,248,0.98),rgba(255,247,240,0.96))] font-sans shadow-2xl shadow-rose-500/10">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.12),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(244,114,182,0.10),transparent_28%)] pointer-events-none" />
      
      {/* Decorative Blur Orbs inside the box */}
      <div className="absolute top-10 left-10 w-72 h-72 bg-rose-200/45 rounded-full mix-blend-multiply filter blur-[80px] opacity-60 -z-10 animate-blob" />
      <div className="absolute bottom-10 right-10 w-72 h-72 bg-orange-200/45 rounded-full mix-blend-multiply filter blur-[80px] opacity-60 -z-10 animate-blob animation-delay-2000" />
      
      {/* Header / Mode Switcher */}
      <div className="flex p-3 bg-white/75 border-b border-amber-100/80 z-10 items-center gap-2">
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
          {canShowHistory ? (
            <TooltipBottom text="History">
              <button 
                onClick={() => setShowHistory(true)} 
                className="p-2.5 rounded-[1.2rem] bg-transparent text-gray-500 hover:text-rose-500 hover:bg-white hover:shadow-sm transition-all" 
              >
                <History className="w-4 h-4" />
              </button>
            </TooltipBottom>
          ) : null}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 scroll-smooth z-10 relative flex flex-col bg-[linear-gradient(180deg,rgba(255,255,255,0.22),rgba(255,248,242,0.12))]">
        
        {/* Empty State / Welcome for IDEA mode */}
        {visibleMessages.length === 0 && mode === "idea" && (
          <div className="flex flex-col items-center justify-center m-auto text-center space-y-6 animate-in fade-in zoom-in duration-500 py-10">
            <div className="relative">
              <div className="absolute inset-0 bg-orange-200 blur-2xl rounded-full" />
              <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-linear-to-br from-white to-orange-50 border border-orange-100 flex items-center justify-center shadow-lg shadow-orange-500/10">
                <Lightbulb className="w-10 h-10 sm:w-12 sm:h-12 text-orange-400" />
              </div>
            </div>
            <div className="space-y-3 flex flex-col items-center">
              <h3 className="text-xl sm:text-2xl font-bold text-gray-800">Better responses for difficult moments.</h3>
              <p className="text-gray-500 text-sm sm:text-base mx-auto leading-relaxed text-center inline-flex flex-col items-center">
                <span className="block sm:whitespace-nowrap">
                  Find a warmer way to respond.
                </span>
                <span className="block sm:whitespace-nowrap">
                  Share what someone said or describe the situation.
                </span>
                <span className="block sm:whitespace-nowrap">
                  Type it into the box below to get thoughtful &#34;Yes, And&#34; replies.
                </span>
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
                  : "bg-white text-gray-700 rounded-3xl rounded-tl-sm border border-amber-100/70 shadow-[0_10px_30px_rgba(251,146,60,0.08)]"
              }`}
            >
              {m.content}
              {renderAssistantMeta(m, isOpenRouterDebug)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} className="h-4" />
      </div>

      {/* Input Form */}
      {!(mode === "practice" && !category && localMessages.length === 0) && (
        <div className="p-3 sm:p-4 bg-white/80 border-t border-amber-100/80 z-10">
          <form
            onSubmit={handleCustomSubmit}
            className="bg-white rounded-3xl p-1.5 sm:p-2 border border-amber-100/80 focus-within:border-orange-300 focus-within:ring-4 focus-within:ring-orange-100/50 transition-all shadow-[0_8px_24px_rgba(251,146,60,0.08)]"
          >
            <textarea
             className="w-full bg-transparent border-none outline-none text-[15px] sm:text-[16px] text-gray-800 px-3 sm:px-4 pt-3 sm:pt-3.5 pb-1.5 sm:pb-2 placeholder:text-gray-400 resize-none min-h-[44px] sm:min-h-[48px] max-h-[160px] sm:max-h-[190px]"
             rows={1}
             value={myInput}
             placeholder={
               isLocalLoading
                 ? "AI is responding... Click stop to cancel."
                 : mode === "idea"
                   ? "Type the conversation or situation here. E.g., My boss wants this done by tonight..."
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
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3 px-1.5 sm:px-2 pb-1 pt-0.5">
              <div className="flex min-w-0 items-center gap-2">
                {mode === 'practice' && category ? (
                  <TooltipTop text="Change Category">
                    <button
                      type="button"
                      onClick={() => {
                        startNewSession("practice", null);
                      }}
                      className="shrink-0 p-2 text-gray-400 hover:text-rose-500 transition-colors rounded-xl hover:bg-rose-50"
                    >
                      <RefreshCcw className="w-4 h-4" />
                    </button>
                  </TooltipTop>
                ) : null}
              </div>
              <div className="min-w-0 text-center text-[10px] sm:text-[11px] font-medium text-gray-400 tracking-wide uppercase">
                <span className="truncate block">Press Enter to send, Shift+Enter for new line</span>
              </div>
              {isLocalLoading ? (
                <button
                 type="button"
                 onClick={() => abortActiveRequest("user")}
                 className="relative justify-self-end shrink-0 p-3 sm:p-3.5 rounded-[1.2rem] bg-linear-to-br from-orange-400 to-rose-400 text-white shadow-lg shadow-rose-400/30 hover:shadow-xl hover:shadow-rose-400/40 transition-all"
                >
                  <CircleStop className="w-4 h-4 sm:w-5 sm:h-5 animate-spin [animation-duration:2s]" />
                </button>
              ) : (
                <button
                 type="submit"
                 disabled={!myInput.trim() && !(mode === 'practice' && localMessages.length === 0)}
                 className="justify-self-end shrink-0 p-3 sm:p-3.5 rounded-[1.2rem] bg-linear-to-br from-orange-400 to-rose-400 text-white hover:shadow-lg hover:shadow-rose-400/40 disabled:opacity-40 disabled:hover:shadow-none transition-all group"
                >
                  <Send className="w-4 h-4 sm:w-5 sm:h-5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                </button>
              )}
            </div>
          </form>
        </div>
      )}

      {/* History Slide-over Panel */}
      {canShowHistory && showHistory && (
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
            <div className="flex-1 overflow-y-auto p-4 pt-2 space-y-2.5 scroll-smooth">
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
                        className="group/item p-3.5 rounded-2xl border border-gray-100 bg-white hover:border-rose-200 hover:shadow-lg hover:shadow-rose-500/5 transition-all cursor-pointer flex flex-col gap-2 relative"
                     >
                        <div className="flex items-center gap-2.5 text-sm font-semibold text-gray-700">
                           <div className={`p-1.5 rounded-lg shrink-0 ${session.mode === "idea" ? "bg-orange-50 text-orange-500" : "bg-rose-50 text-rose-500"}`}>
                             {session.mode === 'idea' ? <Lightbulb className="w-4 h-4"/> : <MessageSquareDiff className="w-4 h-4" />}
                           </div>
                           <TooltipBottom text={getSessionDisplayTitle(session)} className="flex-1 min-w-0">
                             <span className="truncate block pr-2 w-full text-left group-hover/item:text-rose-500 transition-colors">{getSessionDisplayTitle(session)}</span>
                           </TooltipBottom>
                           <span className="text-[11px] text-gray-400 font-medium ml-auto shrink-0">
                              {new Date(session.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                           </span>
                        </div>
                        {renamingSessionId === session.id ? (
                          <div className="px-1 py-0.5" onClick={(e) => e.stopPropagation()}>
                            <input
                              autoFocus
                              value={renamingValue}
                              onChange={(e) => setRenamingValue(e.target.value)}
                              onBlur={() => submitRenameSession(session)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  submitRenameSession(session);
                                }
                                if (e.key === "Escape") {
                                  e.preventDefault();
                                  cancelRenameSession();
                                }
                              }}
                              placeholder="Rename this session"
                              className="w-full rounded-xl border border-orange-200 bg-orange-50/30 px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100 transition-all"
                            />
                          </div>
                        ) : null}
                        <p className="text-sm text-gray-500 line-clamp-2 pr-2 leading-relaxed opacity-80 group-hover/item:opacity-100 transition-opacity">
                           {getSessionPreview(session)}
                        </p>
                        <div className="absolute right-2 bottom-2 flex items-center gap-0.5 opacity-0 group-hover/item:opacity-100 transition-all duration-200 bg-white/95 backdrop-blur-sm p-0.5 rounded-xl shadow-sm border border-gray-100/60">
                           <TooltipLeft text={session.isPinned ? "Unpin" : "Pin"}>
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 togglePinSession(session);
                               }}
                               className={`p-1.5 rounded-lg bg-transparent transition-all hover:bg-white hover:shadow-sm ${
                                 session.isPinned
                                   ? "text-amber-500 hover:text-amber-600"
                                   : "text-gray-400 hover:text-amber-500"
                               }`}
                             >
                               <Pin className="w-3.5 h-3.5" />
                             </button>
                           </TooltipLeft>
                           <TooltipLeft text="Rename">
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 startRenamingSession(session);
                               }}
                               className="p-1.5 text-gray-400 hover:text-orange-500 bg-transparent hover:bg-white hover:shadow-sm rounded-lg transition-all"
                             >
                               <Pencil className="w-3.5 h-3.5" />
                             </button>
                           </TooltipLeft>
                           <TooltipLeft text="Delete">
                             <button 
                                onClick={(e) => { e.stopPropagation(); deleteSession(session.id); }} 
                                className="p-1.5 text-gray-400 hover:text-red-500 bg-transparent hover:bg-white hover:shadow-sm rounded-lg transition-all"
                             >
                                <Trash2 className="w-3.5 h-3.5" />
                             </button>
                           </TooltipLeft>
                        </div>
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
