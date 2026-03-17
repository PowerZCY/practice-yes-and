import { NextRequest, NextResponse } from "next/server";
import {
  deleteChatSessionForCurrentUser,
  listChatSessionsForCurrentUser,
  saveChatSessionForCurrentUser,
  updateChatSessionForCurrentUser,
} from "@/lib/chat-session-server";
import type { Message, Mode, PracticeCategory } from "@/lib/chat-session";

type SaveSessionBody = {
  id: string;
  mode: Mode;
  category: PracticeCategory;
  messages: Message[];
  isPinned: boolean;
  sessionName: string | null;
};

type PatchSessionBody = {
  sessionId: string;
  isPinned?: boolean;
  sessionName?: string | null;
};

function isValidMode(value: unknown): value is Mode {
  return value === "idea" || value === "practice";
}

function isValidCategory(value: unknown): value is PracticeCategory {
  return (
    value === null ||
    value === "workplace" ||
    value === "relationships" ||
    value === "social" ||
    value === "creative" ||
    value === "parenting"
  );
}

function isValidMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") {
    return false;
  }

  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    (message.role === "user" ||
      message.role === "assistant" ||
      message.role === "system") &&
    typeof message.content === "string"
  );
}

function isValidSaveSessionBody(value: unknown): value is SaveSessionBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    typeof body.id === "string" &&
    isValidMode(body.mode) &&
    isValidCategory(body.category) &&
    typeof body.isPinned === "boolean" &&
    (body.sessionName === null ||
      body.sessionName === undefined ||
      typeof body.sessionName === "string") &&
    Array.isArray(body.messages) &&
    body.messages.every(isValidMessage)
  );
}

function isValidPatchSessionBody(value: unknown): value is PatchSessionBody {
  if (!value || typeof value !== "object") {
    return false;
  }

  const body = value as Record<string, unknown>;
  return (
    typeof body.sessionId === "string" &&
    (body.isPinned === undefined || typeof body.isPinned === "boolean") &&
    (body.sessionName === undefined ||
      body.sessionName === null ||
      typeof body.sessionName === "string")
  );
}

export async function GET(request: NextRequest) {
  const sessions = await listChatSessionsForCurrentUser(request);
  return NextResponse.json({ sessions });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  if (!isValidSaveSessionBody(body)) {
    return NextResponse.json({ error: "Invalid session payload" }, { status: 400 });
  }

  await saveChatSessionForCurrentUser(body, request);
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const body = await request.json();
  const sessionId =
    body && typeof body === "object" && typeof body.sessionId === "string"
      ? body.sessionId
      : null;

  if (!sessionId) {
    return NextResponse.json({ error: "Missing sessionId" }, { status: 400 });
  }

  await deleteChatSessionForCurrentUser(sessionId, request);
  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  if (!isValidPatchSessionBody(body)) {
    return NextResponse.json({ error: "Invalid session patch payload" }, { status: 400 });
  }

  await updateChatSessionForCurrentUser(body, request);
  return NextResponse.json({ success: true });
}
