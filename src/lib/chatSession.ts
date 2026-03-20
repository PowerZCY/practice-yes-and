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

export function isHiddenSessionMessage(message: Message) {
  return message.content.includes(HIDDEN_SYSTEM_COMMAND);
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
