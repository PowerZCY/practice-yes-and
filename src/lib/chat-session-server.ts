import "server-only";

import { headers, cookies } from "next/headers";
import type { Prisma } from "@prisma/client";
import { prisma } from "@windrun-huaiin/backend-core/prisma";
import { userAggregateService } from "@windrun-huaiin/backend-core/aggregate";
import { userService } from "@windrun-huaiin/backend-core/database";
import { fetchLatestUserContextByFingerprintId } from "@windrun-huaiin/backend-core/context";
import { getOptionalAuth } from "@windrun-huaiin/third-ui/clerk/patch/optional-auth";
import {
  extractFingerprintFromNextRequest,
  extractFingerprintFromNextStores,
} from "@windrun-huaiin/third-ui/fingerprint/server";
import type { Message, Mode, PracticeCategory, Session } from "@/lib/chat-session";

type DbSessionRow = {
  session_id: string;
  mode: string;
  category: string | null;
  messages: Prisma.JsonValue;
  is_pinned: number;
  session_name: string | null;
  updated_at: Date;
};

type SessionPayload = {
  id: string;
  mode: Mode;
  category: PracticeCategory;
  messages: Message[];
  isPinned: boolean;
  sessionName: string | null;
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

function mapSessionRow(row: DbSessionRow): Session {
  return {
    id: row.session_id,
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
    isPinned: row.is_pinned === 1,
    sessionName: row.session_name,
    updatedAt: row.updated_at.getTime(),
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

export async function resolveCurrentChatSessionUserId(request?: Request) {
  const { userId: clerkUserId } = await getOptionalAuth();
  if (clerkUserId) {
    const user = await userService.findByClerkUserId(clerkUserId);
    if (user?.userId) {
      return user.userId;
    }
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

  return resolveUserIdByFingerprint(fingerprintId);
}

export async function listChatSessionsForCurrentUser(request?: Request) {
  const userId = await resolveCurrentChatSessionUserId(request);
  if (!userId) {
    return [];
  }

  const rows = await prisma.$queryRaw<DbSessionRow[]>`
    SELECT
      session_id,
      mode,
      category,
      messages,
      is_pinned,
      session_name,
      updated_at
    FROM yesand.chat_sessions
    WHERE user_id = ${userId}::uuid
      AND deleted = 0
    ORDER BY is_pinned DESC, updated_at DESC
  `;

  return rows.map(mapSessionRow);
}

export async function saveChatSessionForCurrentUser(
  payload: SessionPayload,
  request?: Request,
) {
  const userId = await resolveCurrentChatSessionUserId(request);
  if (!userId) {
    throw new Error("Unable to resolve current user for chat session");
  }

  await prisma.$executeRaw`
    INSERT INTO yesand.chat_sessions (
      session_id,
      user_id,
      mode,
      category,
      messages,
      is_pinned,
      session_name,
      created_at,
      updated_at,
      deleted
    )
    VALUES (
      ${payload.id},
      ${userId}::uuid,
      ${payload.mode},
      ${payload.category},
      ${JSON.stringify(payload.messages)}::jsonb,
      ${payload.isPinned ? 1 : 0},
      ${payload.sessionName?.trim() || null},
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      0
    )
    ON CONFLICT (session_id) DO UPDATE
    SET
      user_id = EXCLUDED.user_id,
      mode = EXCLUDED.mode,
      category = EXCLUDED.category,
      messages = EXCLUDED.messages,
      is_pinned = EXCLUDED.is_pinned,
      session_name = EXCLUDED.session_name,
      updated_at = CURRENT_TIMESTAMP,
      deleted = 0
  `;
}

export async function updateChatSessionForCurrentUser(
  params: {
    sessionId: string;
    isPinned?: boolean;
    sessionName?: string | null;
  },
  request?: Request,
) {
  const userId = await resolveCurrentChatSessionUserId(request);
  if (!userId) {
    return;
  }

  if (typeof params.isPinned === "boolean" && params.sessionName !== undefined) {
    await prisma.$executeRaw`
      UPDATE yesand.chat_sessions
      SET
        is_pinned = ${params.isPinned ? 1 : 0},
        session_name = ${params.sessionName?.trim() || null},
        updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ${params.sessionId}
        AND user_id = ${userId}::uuid
        AND deleted = 0
    `;
    return;
  }

  if (typeof params.isPinned === "boolean") {
    await prisma.$executeRaw`
      UPDATE yesand.chat_sessions
      SET
        is_pinned = ${params.isPinned ? 1 : 0},
        updated_at = CURRENT_TIMESTAMP
      WHERE session_id = ${params.sessionId}
        AND user_id = ${userId}::uuid
        AND deleted = 0
    `;
    return;
  }

  await prisma.$executeRaw`
    UPDATE yesand.chat_sessions
    SET
      session_name = ${params.sessionName?.trim() || null},
      updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ${params.sessionId}
      AND user_id = ${userId}::uuid
      AND deleted = 0
  `;
}

export async function deleteChatSessionForCurrentUser(
  sessionId: string,
  request?: Request,
) {
  const userId = await resolveCurrentChatSessionUserId(request);
  if (!userId) {
    return;
  }

  await prisma.$executeRaw`
    UPDATE yesand.chat_sessions
    SET
      deleted = 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE session_id = ${sessionId}
      AND user_id = ${userId}::uuid
      AND deleted = 0
  `;
}
