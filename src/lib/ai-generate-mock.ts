import { appConfig } from "@/lib/appConfig";
import {
  AI_GENERATE_ERROR_MESSAGES,
  createMockTextByContext,
} from "@/lib/ai-generate-content";
import { createAIErrorPayload } from "@/lib/ai-generate-error";

const streamingHeaders = {
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-cache, no-store, max-age=0, must-revalidate, no-transform",
  Connection: "keep-alive",
  Pragma: "no-cache",
  "X-Accel-Buffering": "no",
} as const;

type MockFailureType = "timeout" | "request_aborted" | "stream_error";

type MockScenario = {
  initialDelayMs?: number;
  streamFailureType?: MockFailureType;
  streamFailureAfterChunks?: number;
  immediateErrorType?: MockFailureType;
};

function getMockScenario(mockType: number): MockScenario {
  switch (mockType) {
    case 1:
      return {
        initialDelayMs: appConfig.openrouterAI.mockTimeoutSeconds * 1000,
      };
    case 2:
      return {
        immediateErrorType: "timeout",
      };
    case 3:
      return {
        streamFailureType: "timeout",
        streamFailureAfterChunks: 3,
      };
    case 4:
      return {
        streamFailureType: "request_aborted",
        streamFailureAfterChunks: 3,
      };
    case 5:
      return {
        streamFailureType: "stream_error",
        streamFailureAfterChunks: 3,
      };
    default:
      return {};
  }
}

async function sleep(delayInMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayInMs));
}

function createMockFailureResponse(failureType: MockFailureType) {
  if (failureType === "timeout") {
    return Response.json(
      createAIErrorPayload({
        message: AI_GENERATE_ERROR_MESSAGES.timeout,
        upstreamStatusCode: 408,
      }),
      { status: 408 },
    );
  }

  if (failureType === "request_aborted") {
    return Response.json(
      createAIErrorPayload({
        message: AI_GENERATE_ERROR_MESSAGES.requestAborted,
        upstreamStatusCode: 499,
      }),
      { status: 499 },
    );
  }

  return Response.json(
    createAIErrorPayload({
      message: AI_GENERATE_ERROR_MESSAGES.errorCommunicatingWithAI,
      upstreamStatusCode: 502,
      failureReason: "stream_error",
    }),
    { status: 502 },
  );
}

function createMockStreamResponse(
  text: string,
  streamFailureType?: MockFailureType,
  streamFailureAfterChunks = 0,
) {
  const encoder = new TextEncoder();
  const chunkSize = Math.max(1, appConfig.openrouterAI.mockStreamChunkSize);
  const chunkDelay = Math.max(0, appConfig.openrouterAI.mockStreamChunkDelayMs);
  const wordChunks = text.match(/\S+\s*/g) ?? [text];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (
        let index = 0, chunkIndex = 0;
        index < wordChunks.length;
        index += chunkSize, chunkIndex += 1
      ) {
        if (
          streamFailureType &&
          streamFailureAfterChunks > 0 &&
          chunkIndex >= streamFailureAfterChunks
        ) {
          break;
        }

        controller.enqueue(
          encoder.encode(wordChunks.slice(index, index + chunkSize).join("")),
        );

        if (chunkDelay > 0) {
          await sleep(chunkDelay);
        }
      }

      controller.close();
    },
  });

  return new Response(stream, {
      headers: {
        ...streamingHeaders,
        ...(streamFailureType && streamFailureAfterChunks > 0
          ? { "X-AI-Stream-Error": streamFailureType }
          : {}),
      },
  });
}

export async function maybeHandleAIGenerateMock(params: {
  context: string;
  isInitialPractice: boolean;
}) {
  if (!appConfig.openrouterAI.enableMock) {
    return null;
  }

  const scenario = getMockScenario(appConfig.openrouterAI.mockType);

  if ((scenario.initialDelayMs ?? 0) > 0) {
    await sleep(scenario.initialDelayMs!);
  }

  if (scenario.immediateErrorType) {
    return createMockFailureResponse(scenario.immediateErrorType);
  }

  return createMockStreamResponse(
    createMockTextByContext(params.context, params.isInitialPractice),
    scenario.streamFailureType,
    scenario.streamFailureAfterChunks,
  );
}
