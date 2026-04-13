import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText } from "ai";
import { appConfig } from "@/lib/appConfig";
import {
  createAIErrorPayload,
  normalizeAIError,
} from "@/lib/ai-generate-error";
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

async function createGuardedTextStreamResponse(
  fullStream: AsyncIterable<{
    type: string;
    text?: string;
    error?: unknown;
  }>,
) {
  const iterator = fullStream[Symbol.asyncIterator]();
  let firstChunk: IteratorResult<{
    type: string;
    text?: string;
    error?: unknown;
  }>;

  try {
    while (true) {
      firstChunk = await iterator.next();
      if (firstChunk.done) {
        break;
      }

      if (firstChunk.value.type === "error") {
        const aiError = normalizeAIError(firstChunk.value.error);
        return Response.json(aiError, { status: aiError.upstreamStatusCode ?? 500 });
      }

      if (firstChunk.value.type === "text-delta") {
        break;
      }
    }
  } catch (error) {
    console.error("[AI-Stream-Start-Error]", error);
    const aiError = normalizeAIError(error);
    return Response.json(aiError, { status: aiError.upstreamStatusCode ?? 500 });
  }

  if (firstChunk.done) {
    const aiError = createAIErrorPayload({
      message: AI_GENERATE_ERROR_MESSAGES.emptyAIResponse,
      upstreamStatusCode: 502,
      failureReason: "empty_response",
    });
    return Response.json(aiError, { status: aiError.upstreamStatusCode });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      if (!firstChunk.done && firstChunk.value.type === "text-delta" && firstChunk.value.text) {
        controller.enqueue(encoder.encode(firstChunk.value.text));
      }

      try {
        while (true) {
          const nextChunk = await iterator.next();
          if (nextChunk.done) {
            break;
          }

          if (nextChunk.value.type === "error") {
            throw nextChunk.value.error;
          }

          if (nextChunk.value.type === "text-delta" && nextChunk.value.text) {
            controller.enqueue(encoder.encode(nextChunk.value.text));
          }
        }

        controller.close();
      } catch (error) {
        console.error("[AI-Stream-Error]", error);
        controller.error(error);
      }
    },
    async cancel() {
      await iterator.return?.();
    },
  });

  return new Response(stream, {
    headers: streamingHeaders,
  });
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

    return await createGuardedTextStreamResponse(result.fullStream);
  } catch (error) {
    console.error("[AI-Error]", error);

    if (request.signal.aborted) {
      const aiError = createAIErrorPayload({
        message:
          request.signal.reason === "timeout"
            ? AI_GENERATE_ERROR_MESSAGES.timeout
            : AI_GENERATE_ERROR_MESSAGES.requestAborted,
        upstreamStatusCode: 499,
      });
      return Response.json(aiError, { status: 499 });
    }

    const aiError = normalizeAIError(error);
    return Response.json(aiError, { status: aiError.upstreamStatusCode ?? 500 });
  }
}
