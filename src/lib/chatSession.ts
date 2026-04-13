export type Mode = "idea" | "practice";

export type PracticeCategory =
  | "workplace"
  | "relationships"
  | "social"
  | "creative"
  | "parenting"
  | null;

export type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status?:
    | "streaming"
    | "completed"
    | "stopped"
    | "timeout"
    | "request_aborted"
    | "upstream_interrupted";
};

export type Session = {
  id: string;
  mode: Mode;
  category: PracticeCategory;
  messages: Message[];
  isPinned: boolean;
  sessionName: string | null;
  updatedAt: number;
};

export const HIDDEN_SYSTEM_COMMAND = "[Hidden System Command]";
export const DEFAULT_CONTEXT_WINDOW_TURNS = 6;

export function isHiddenSessionMessage(message: Message) {
  return message.content.includes(HIDDEN_SYSTEM_COMMAND);
}

export function getVisibleConversationMessages(messages: Message[]) {
  return messages.filter((message) => !isHiddenSessionMessage(message));
}

export function buildConversationWindow(
  messages: Message[],
  maxUserTurns = DEFAULT_CONTEXT_WINDOW_TURNS,
) {
  if (maxUserTurns <= 0) {
    return [];
  }

  const visibleMessages = getVisibleConversationMessages(messages);
  const windowedMessages: Message[] = [];
  let userTurnCount = 0;

  for (let index = visibleMessages.length - 1; index >= 0; index -= 1) {
    const message = visibleMessages[index];

    if (message.role === "user") {
      userTurnCount += 1;
      if (userTurnCount > maxUserTurns) {
        break;
      }
    }

    windowedMessages.unshift(message);
  }

  return windowedMessages;
}

export function extractFirstParagraph(content: string) {
  const normalized = content.trim();
  if (!normalized) {
    return "";
  }

  const [firstParagraph] = normalized.split(/\n\s*\n/);
  return firstParagraph.trim();
}

export function getSessionPreview(session: Session) {
  if (session.mode === "practice") {
    const firstAssistantMessage = session.messages.find(
      (message) => message.role === "assistant" && message.content.trim(),
    );

    if (firstAssistantMessage) {
      return extractFirstParagraph(firstAssistantMessage.content);
    }
  }

  const firstVisibleUserMessage = session.messages.find(
    (message) =>
      message.role === "user" &&
      !isHiddenSessionMessage(message) &&
      message.content.trim(),
  );

  if (firstVisibleUserMessage) {
    return extractFirstParagraph(firstVisibleUserMessage.content);
  }

  const firstAssistantMessage = session.messages.find(
    (message) => message.role === "assistant" && message.content.trim(),
  );

  if (firstAssistantMessage) {
    return extractFirstParagraph(firstAssistantMessage.content);
  }

  return "Empty conversation";
}

export function getSessionBaseTitle(session: Session) {
  if (session.mode === "idea") {
    return "Idea Inspiration";
  }

  switch (session.category) {
    case "parenting":
      return "Parent-Child";
    case "workplace":
      return "Workplace";
    case "relationships":
      return "Relationships";
    case "social":
      return "Social Life";
    case "creative":
      return "Improv";
    default:
      return "Practice";
  }
}

export function getSessionDisplayTitle(session: Session) {
  const baseTitle = getSessionBaseTitle(session);
  const customTitle = session.sessionName?.trim();
  return customTitle ? `${baseTitle} · ${customTitle}` : baseTitle;
}
