import { APICallError } from "ai";
import {
  type AIErrorPayload,
  type AIMessageFailureReason,
  mapHttpStatusToFailureReason,
  mapHttpStatusToMessageStatus,
} from "@/lib/ai-message-status";
import { AI_GENERATE_ERROR_MESSAGES } from "@/lib/ai-generate-content";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getProviderErrorMessage(data: unknown) {
  if (!isObject(data)) {
    return null;
  }

  const error = data.error;
  if (isObject(error) && typeof error.message === "string") {
    return error.message;
  }

  if (typeof data.message === "string") {
    return data.message;
  }

  return null;
}

function getResponseBodyErrorMessage(responseBody?: string) {
  if (!responseBody) {
    return null;
  }

  try {
    return getProviderErrorMessage(JSON.parse(responseBody));
  } catch {
    return null;
  }
}

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function createAIErrorPayload(params: {
  message: string;
  upstreamStatusCode: number;
  failureReason?: AIMessageFailureReason;
}): AIErrorPayload {
  const failureReason =
    params.failureReason ??
    mapHttpStatusToFailureReason(params.upstreamStatusCode, params.message);

  return {
    error: params.message,
    status: mapHttpStatusToMessageStatus(params.upstreamStatusCode),
    failureReason,
    upstreamStatusCode: params.upstreamStatusCode,
  };
}

export function normalizeAIError(error: unknown): AIErrorPayload {
  if (APICallError.isInstance(error)) {
    const upstreamStatusCode =
      typeof error.statusCode === "number" &&
      error.statusCode >= 400 &&
      error.statusCode <= 599
        ? error.statusCode
        : 502;
    const message =
      getProviderErrorMessage(error.data) ??
      getResponseBodyErrorMessage(error.responseBody) ??
      error.message ??
      AI_GENERATE_ERROR_MESSAGES.errorCommunicatingWithAI;

    return createAIErrorPayload({
      message,
      upstreamStatusCode,
    });
  }

  if (isAbortError(error)) {
    return {
      error: AI_GENERATE_ERROR_MESSAGES.timeout,
      status: "timeout",
      upstreamStatusCode: 408,
    };
  }

  return {
    error:
      error instanceof Error
        ? error.message
        : AI_GENERATE_ERROR_MESSAGES.errorCommunicatingWithAI,
    status: "failed",
    failureReason: "unknown",
    upstreamStatusCode: 500,
  };
}
