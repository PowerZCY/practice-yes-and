
import { headers, cookies } from "next/headers";
import type { ChatSession as PrismaChatSession, Prisma } from "@prisma/client";
import { prisma } from "@windrun-huaiin/backend-core/prisma";
import { userAggregateService } from "@windrun-huaiin/backend-core/aggregate";
import { fetchLatestUserContextByFingerprintId } from "@windrun-huaiin/backend-core/context";
import { getOptionalServerAuthUser } from '@windrun-huaiin/backend-core/auth/server';
import {
  extractFingerprintFromNextRequest,
  extractFingerprintFromNextStores,
} from "@windrun-huaiin/third-ui/fingerprint/server";
import type { Message, Mode, PracticeCategory, Session } from "@/lib/chatSession";

type SessionPayload = {
  id: string;
  mode: Mode;
  category: PracticeCategory;
  messages: Message[];
  isPinned: boolean;
  sessionName: string | null;
};

type ChatSessionScope = "anonymous" | "authenticated";

type ChatSessionIdentity = {
  userId: string;
  scope: ChatSessionScope;
};

function normalizeMessages(value: Prisma.JsonValue): Message[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!item || typeof item !== "object") {
      return [];
    }

    const message = item as Record<string, unknown>;
    if (
      typeof message.id !== "string" ||
      (message.role !== "user" &&
        message.role !== "assistant" &&
        message.role !== "system") ||
      typeof message.content !== "string"
    ) {
      return [];
    }

    return [
      {
        id: message.id,
        role: message.role,
        content: message.content,
      },
    ];
  });
}

function sortSessions(sessions: Session[]) {
  return [...sessions].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return Number(b.isPinned) - Number(a.isPinned);
    }

    return b.updatedAt - a.updatedAt;
  });
}

function mapSessionRow(row: PrismaChatSession): Session {
  return {
    id: row.sessionId,
    mode: row.mode === "practice" ? "practice" : "idea",
    category:
      row.category === "workplace" ||
      row.category === "relationships" ||
      row.category === "social" ||
      row.category === "creative" ||
      row.category === "parenting"
        ? row.category
        : null,
    messages: normalizeMessages(row.messages),
    isPinned: row.isPinned === 1,
    sessionName: row.sessionName,
    updatedAt: row.updatedAt?.getTime() ?? Date.now(),
  };
}

async function resolveUserIdByFingerprint(fingerprintId: string) {
  const existingContext = await fetchLatestUserContextByFingerprintId(fingerprintId);
  if (existingContext?.user.userId) {
    return existingContext.user.userId;
  }

  const { newUser } = await userAggregateService.initAnonymousUser(fingerprintId);
  return newUser.userId;
}

export async function resolveCurrentChatSessionIdentity(
  request?: Request,
): Promise<ChatSessionIdentity | null> {
  const authUser = await getOptionalServerAuthUser();
  if (authUser) {
    const { user } = authUser;
    return {
      userId: user.userId,
      scope: "authenticated",
    };
  }

  const fingerprintId = request
    ? extractFingerprintFromNextRequest(request)
    : extractFingerprintFromNextStores({
        headers: await headers(),
        cookies: await cookies(),
      });

  if (!fingerprintId) {
    return null;
  }

  const userId = await resolveUserIdByFingerprint(fingerprintId);
  return {
    userId,
    scope: "anonymous",
  };
}

export async function listChatSessionsForCurrentUser(request?: Request) {
  const identity = await resolveCurrentChatSessionIdentity(request);
  if (!identity) {
    return [];
  }

  const rows = await prisma.chatSession.findMany({
    where: {
      userId: identity.userId,
      sessionScope: identity.scope,
      deleted: 0,
    },
  });

  return sortSessions(rows.map(mapSessionRow));
}

export async function saveChatSessionForCurrentUser(
  payload: SessionPayload,
  request?: Request,
) {
  const identity = await resolveCurrentChatSessionIdentity(request);
  if (!identity) {
    throw new Error("Unable to resolve current user for chat session");
  }

  await prisma.chatSession.upsert({
    where: {
      sessionId: payload.id,
    },
    create: {
      sessionId: payload.id,
      userId: identity.userId,
      sessionScope: identity.scope,
      mode: payload.mode,
      category: payload.category,
      messages: payload.messages,
      isPinned: payload.isPinned ? 1 : 0,
      sessionName: payload.sessionName?.trim() || null,
      deleted: 0,
    },
    update: {
      userId: identity.userId,
      sessionScope: identity.scope,
      mode: payload.mode,
      category: payload.category,
      messages: payload.messages,
      isPinned: payload.isPinned ? 1 : 0,
      sessionName: payload.sessionName?.trim() || null,
      deleted: 0,
    },
  });
}

export async function updateChatSessionForCurrentUser(
  params: {
    sessionId: string;
    isPinned?: boolean;
    sessionName?: string | null;
  },
  request?: Request,
) {
  const identity = await resolveCurrentChatSessionIdentity(request);
  if (!identity) {
    return;
  }

  if (typeof params.isPinned === "boolean" && params.sessionName !== undefined) {
    await prisma.chatSession.updateMany({
      where: {
        sessionId: params.sessionId,
        userId: identity.userId,
        sessionScope: identity.scope,
        deleted: 0,
      },
      data: {
        isPinned: params.isPinned ? 1 : 0,
        sessionName: params.sessionName?.trim() || null,
      },
    });
    return;
  }

  if (typeof params.isPinned === "boolean") {
    await prisma.chatSession.updateMany({
      where: {
        sessionId: params.sessionId,
        userId: identity.userId,
        sessionScope: identity.scope,
        deleted: 0,
      },
      data: {
        isPinned: params.isPinned ? 1 : 0,
      },
    });
    return;
  }

  await prisma.chatSession.updateMany({
    where: {
      sessionId: params.sessionId,
      userId: identity.userId,
      sessionScope: identity.scope,
      deleted: 0,
    },
    data: {
      sessionName: params.sessionName?.trim() || null,
    },
  });
}

export async function deleteChatSessionForCurrentUser(
  sessionId: string,
  request?: Request,
) {
  const identity = await resolveCurrentChatSessionIdentity(request);
  if (!identity) {
    return;
  }

  await prisma.chatSession.updateMany({
    where: {
      sessionId,
      userId: identity.userId,
      sessionScope: identity.scope,
      deleted: 0,
    },
    data: {
      deleted: 1,
    },
  });
}
