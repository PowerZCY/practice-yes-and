import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import { appConfig } from "@/lib/appConfig";
import { maybeHandleAIGenerateMock } from "@/lib/ai-generate-mock";
import {
  AI_GENERATE_ERROR_MESSAGES,
  buildSystemPrompt,
  PRACTICE_INITIAL_USER_PROMPT,
} from "@/lib/ai-generate-content";

export const runtime = "edge";
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const appHeaders = {
  "HTTP-Referer": appConfig.baseUrl,
  "X-Title": appConfig.openrouterAI.appName,
};

const streamingHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate, no-transform",
  Connection: "keep-alive",
  Pragma: "no-cache",
  "X-Accel-Buffering": "no",
};

type RequestMessage = {
  role?: "user" | "assistant" | "system";
  content?: string;
};

type GenerateBody = {
  messages?: RequestMessage[];
  context?: string;
  isInitialPractice?: boolean;
  sessionId?: string;
};

function normalizeMessages(messages: GenerateBody["messages"], systemPrompt: string) {
  const aiMessages = [
    { role: "system" as const, content: systemPrompt },
    ...((messages || []).map((message) => ({
      role: (message.role || "user") as "user" | "assistant" | "system",
      content: message.content || "",
    }))),
  ];

  return aiMessages;
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException && error.name === "AbortError"
  );
}

function createUpstreamAbortSignal(requestSignal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);

  const forwardAbort = () => {
    clearTimeout(timeoutId);
    controller.abort(requestSignal.reason ?? "request_aborted");
  };

  if (requestSignal.aborted) {
    forwardAbort();
  } else {
    requestSignal.addEventListener("abort", forwardAbort, { once: true });
  }

  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timeoutId);
      requestSignal.removeEventListener("abort", forwardAbort);
    },
    { once: true },
  );

  return controller.signal;
}

// POST: 文本生成 (Streaming)
export async function POST(request: Request) {
  let body: GenerateBody;
  try {
    body = (await request.json()) as GenerateBody;
  } catch (error) {
    console.error("[AI-Generate] Error parsing request body:", error);
    return Response.json(
      { error: AI_GENERATE_ERROR_MESSAGES.invalidJsonRequestBody },
      { status: 400 },
    );
  }

  const { messages, context, isInitialPractice = false, sessionId } = body;

  if (!context) {
    return Response.json({ error: AI_GENERATE_ERROR_MESSAGES.contextRequired }, { status: 400 });
  }

  const systemPrompt = buildSystemPrompt(context);
  if (!systemPrompt) {
    console.error("[AI-Request]", `[${context}] is not supported`);
    return Response.json(
      { error: AI_GENERATE_ERROR_MESSAGES.contextNotSupported },
      { status: 400 },
    );
  }

  try {
    if (appConfig.openrouterAI.enableMock) {
      const mockResponse = await maybeHandleAIGenerateMock({
        context,
        isInitialPractice,
      });
      if (mockResponse) {
        return mockResponse;
      }
    }

    const aiMessages = normalizeMessages(messages, systemPrompt);

    if (isInitialPractice) {
      aiMessages.push({
        role: "user",
        content: PRACTICE_INITIAL_USER_PROMPT,
      });
    }

    const modelName = appConfig.openrouterAI.modelName;
    console.warn("[AI-Request-Stream]", { modelName, context, sessionId });

    const openrouter = createOpenRouter({
      apiKey: appConfig.openrouterAI.apiKey,
      headers: appHeaders,
    });
    const timeoutMs = Math.max(1000, appConfig.openrouterAI.timeoutSeconds * 1000);
    const abortSignal = createUpstreamAbortSignal(request.signal, timeoutMs);

    const result = streamText({
      model: openrouter.chat(modelName, {
        extraBody: sessionId ? { session_id: sessionId } : undefined,
      }),
      messages: aiMessages,
      abortSignal,
      timeout: timeoutMs,
    });

    return result.toTextStreamResponse({
      headers: streamingHeaders,
    });
  } catch (error) {
    console.error("[AI-Error]", error);

    if (request.signal.aborted) {
      const reason =
        request.signal.reason === "timeout"
          ? AI_GENERATE_ERROR_MESSAGES.timeout
          : AI_GENERATE_ERROR_MESSAGES.requestAborted;
      return Response.json({ error: reason }, { status: 499 });
    }

    if (isAbortError(error)) {
      return Response.json({ error: AI_GENERATE_ERROR_MESSAGES.timeout }, { status: 408 });
    }

    const message =
      error instanceof Error
        ? error.message
        : AI_GENERATE_ERROR_MESSAGES.errorCommunicatingWithAI;
    return Response.json({ error: message }, { status: 500 });
  }
}
