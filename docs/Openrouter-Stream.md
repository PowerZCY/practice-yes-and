# OpenRouter 流式响应设计

本文档描述一套通用的 OpenRouter 流式 AI 响应设计，重点包括前端流式消费、消息状态设计、超时与中断处理、Mock 设计、多轮上下文，以及主功能文案与核心逻辑的分离。

本文档不讨论消息落库。消息是否持久化，是应用层策略，不属于这里的通用流式响应设计。

## 目标

- AI 输出必须返回真正的 HTTP stream，而不是一次性 buffered text response。
- 前端能够按 chunk 增量渲染，形成类似打字机的输出效果。
- 本地开发可以通过 mock 流测试，不必真实调用模型。
- 用户主动停止生成时，需要有明确的取消路径。
- 超时、中断、上游异常等情况不能污染消息 `content`。
- 提示词、mock 文本、状态文案等主功能文本应与 route/control-flow 逻辑分离。
- 多轮对话应显式携带上下文，不依赖 provider 的隐式记忆假设。

## 端到端流式链路

基础流程如下：

1. 前端发送 chat 请求，带上可见对话窗口、上下文元信息和 session 标识。
2. API route 校验请求，构造模型消息。
3. API route 根据配置返回 mock `ReadableStream`，或调用 OpenRouter 的真实模型流。
4. route 返回 text stream response，并设置防缓冲 headers。
5. 前端通过 `response.body.getReader()` 增量读取。
6. 每个 chunk 到达时，更新当前 assistant 消息的 `content`。
7. stream 正常完成后，将 assistant 消息状态设置为 `completed`。

推荐的 stream response headers：

```ts
{
  "Content-Type": "text/plain; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "Connection": "keep-alive",
  "X-Accel-Buffering": "no",
}
```

`Cache-Control: no-transform` 和 `X-Accel-Buffering: no` 的作用是尽量避免代理、平台或网关把小 chunk 缓冲后再一次性返回给浏览器。

## 真实模型流

通过 AI SDK provider 调 OpenRouter 时，可以使用 `streamText()`，并通过 `toTextStreamResponse()` 返回纯文本流：

```ts
const result = streamText({
  model: openrouter.chat(modelName, {
    extraBody: sessionId ? { session_id: sessionId } : undefined,
  }),
  messages,
  abortSignal,
  timeout,
  experimental_transform: smoothStream({ delayInMs: 20, chunking: "word" }),
});

return result.toTextStreamResponse({ headers: streamingHeaders });
```

`smoothStream()` 不是流式正确性的必要条件，但能改善用户感知。有些模型或供应商会返回较大的 chunk，前端会表现成“一块一块地跳”。使用 smoothing transform 后，即使上游 chunk 粒度不稳定，UI 也能更稳定地呈现打字机效果。

## 前端流式消费

请求开始前，前端应先创建一个 assistant 占位消息：

```ts
{
  id,
  role: "assistant",
  content: "",
  status: "streaming",
}
```

然后增量读取并解码 chunk：

```ts
const reader = response.body.getReader();
const decoder = new TextDecoder();
let assistantMessage = "";

while (true) {
  const { value, done } = await reader.read();
  if (done) break;

  if (value) {
    assistantMessage += decoder.decode(value, { stream: true });
    updateAssistantMessage({ content: assistantMessage, status: "streaming" });
  }
}

assistantMessage += decoder.decode();
updateAssistantMessage({ content: assistantMessage, status: "completed" });
```

如果 UI 需要打字机效果，不能使用 `response.text()`。`response.text()` 会等待完整 response 结束后再返回，天然会破坏逐 chunk 展示。

## 消息状态设计

消息 `content` 只应该保存模型可见的对话文本。运行状态、错误状态、停止状态都应该放到独立字段里。

推荐的 assistant 消息状态：

```ts
type MessageStatus =
  | "streaming"
  | "completed"
  | "stopped"
  | "timeout"
  | "request_aborted"
  | "upstream_interrupted";
```

各状态含义：

- `streaming`
  assistant 消息正在接收 stream chunk。
- `completed`
  stream 正常完成。
- `stopped`
  用户明确主动停止了本次生成。
- `timeout`
  应用自己控制的超时触发了。
- `request_aborted`
  当前请求在完成前被 abort。这个状态不应过度承诺为“用户客户端主动断开”，因为它也可能来自运行时、代理、路由取消等。
- `upstream_interrupted`
  上游模型流或网络路径在完成前异常中断。这是一个兜底分类，不是精确根因诊断。

不要把 `[Generation stopped]` 这类状态文本拼进 `content`。一旦拼进 `content`，后续多轮对话再次把历史消息发给模型时，就会污染模型上下文。正确做法是在 UI 层根据 `status` 单独渲染状态文案。

状态文案示例：

```ts
const ASSISTANT_STATUS_COPY = {
  stopped: "Generation stopped by user.",
  timeout: "Generation timed out before completion.",
  requestAborted:
    "Generation stopped because the request was aborted before completion.",
  upstreamInterrupted:
    "Generation stopped before completion because the upstream stream was interrupted.",
};
```

## 主动中断处理

取消链路有两端：

- 前端取消浏览器侧 `fetch`。
- 服务端取消上游模型请求。

前端应该把当前请求的 `AbortController` 存在 ref 或等价的稳定容器里：

```ts
const controller = new AbortController();

fetch("/api/ai-generate", {
  method: "POST",
  body,
  signal: controller.signal,
});
```

用户点击停止时：

```ts
controller.abort("user");
```

如果前端捕获到 abort，并且 `signal.reason === "user"`，应将当前 assistant 消息状态设置为 `stopped`，同时保留已经生成出来的 partial content。

下面这些场景也应中断当前请求：

- 新开一个 chat。
- 切换到另一个会话。
- 切换模式或分类。
- 组件卸载。

这样可以避免旧 stream 的后续 chunk 写入错误的对话上下文。

## 超时处理

超时应该由应用显式控制，不应只依赖平台默认超时。

服务端可以创建一个 timeout signal，并传给 `streamText()`：

```ts
const timeoutMs = timeoutSeconds * 1000;
const timeoutId = setTimeout(() => controller.abort("timeout"), timeoutMs);

const result = streamText({
  model,
  messages,
  abortSignal: controller.signal,
  timeout: timeoutMs,
});
```

当确认是应用自己的 timeout 触发时，应返回或暴露结构化错误原因，例如 `timeout`。前端再据此把 assistant 消息状态设置为 `timeout`。

和普通网络中断相比，timeout 更容易被可靠分类，因为它是应用自己创建和控制的信号。

## Request Abort 与 Upstream Interruption

不是所有中断都能精确判断根因。

推荐使用保守命名：

- `request_aborted`
  服务端 request signal 被 abort。它表示当前请求链路提前结束，但不一定表示终端用户主动取消。可能来源包括浏览器导航、运行时取消、代理取消、平台回收或其他基础设施行为。

- `upstream_interrupted`
  模型流未正常完成，并且没有更精确的原因可用。它可能来自 OpenRouter、底层模型供应商、网络路径或代理层。它适合作为工程分类，不适合当作精确根因。

除非系统能证明一定是客户端造成，否则不要命名为 `client_aborted`。

## 多轮上下文

OpenRouter 的 `session_id` 这类请求元信息可以用于分组、追踪或 provider 侧能力，但应用层记忆不应依赖它。

多轮对话应显式发送上下文：

- 应用可以保留完整对话。
- 每次模型调用前，构建最近的可见消息窗口。
- 过滤掉隐藏 UI 指令、系统占位消息等不应进入模型上下文的内容。
- 只发送最近 `X` 个 user turn，以及这些 user turn 之间的 assistant 消息。

例如：

```ts
const contextWindowTurns = 6;
```

这里的含义是“发送最近 6 个用户轮次，以及夹在这些轮次之间的 assistant 消息”，不是“发送 6 条消息”。

对于很长的会话，更稳妥的设计是：

```text
system prompt + conversation summary + recent message window
```

summary 应由应用层维护，并显式放入 prompt。这样可以控制 token 增长，同时保留关键上下文。

## 主功能文案与核心逻辑分离

以下内容建议从 route/control-flow 代码里抽离：

- System prompts。
- Practice start prompts。
- Mock model responses。
- 用户可见的 AI 状态文案。
- 会驱动 UI 行为的 API error reason constants。

这样 API route 可以专注于请求处理、流式响应、abort、timeout 和响应格式。

不要过度抽象辅助文本，例如日志文案或临时 debug label。日志属于辅助功能，不是 AI 请求/响应的主功能路径。

## Mock 小结

Mock 是纯开发/测试行为，应该与正常请求主逻辑剥离。推荐做法是：

- route 中先通过 `OPENROUTER_ENABLE_MOCK` 判断是否允许 mock。
- 只有开关为真时，才进入独立的 mock helper。
- mock helper 内部再根据一个最小化的 `mock_type` 数字开关切换场景。

### Mock 配置表

| 配置项 | 含义 | 备注 |
| --- | --- | --- |
| `OPENROUTER_ENABLE_MOCK` | 是否启用 mock | `true` 时 route 才进入 mock 分支 |
| `OPENROUTER_MOCK_TYPE` | mock 场景编号 | 用数字表示固定场景，避免大量分散配置污染主逻辑 |
| `OPENROUTER_MOCK_TIMEOUT_SECONDS` | mock 场景中使用的等待时间，单位秒 | 主要给“先等待，再开始流式输出”的场景使用 |
| `OPENROUTER_MOCK_STREAM_CHUNK_DELAY_MS` | mock stream 每个 chunk 之间的延迟，单位毫秒 | 用于模拟输出速度 |
| `OPENROUTER_MOCK_STREAM_CHUNK_SIZE` | mock stream 每个 chunk 的词数 | 当前按“词”分块，不按字节分块 |

### Mock Type 表

| `OPENROUTER_MOCK_TYPE` | 场景 | 行为说明 |
| --- | --- | --- |
| `0` | 正常 mock 流式成功 | 直接开始流式输出，最后状态为 `completed` |
| `1` | 先等待，再正常流式成功 | 先等待 `OPENROUTER_MOCK_TIMEOUT_SECONDS`，再开始流式输出；用于测试前端 loading / 生成中过渡状态 |
| `2` | 立即 timeout | 不进入流，直接返回 timeout 错误；前端状态为 `timeout` |
| `3` | 输出部分内容后 timeout | 先流式输出一部分内容，再以 `timeout` 结束；前端保留 partial content，并把状态设为 `timeout` |
| `4` | 输出部分内容后 request_aborted | 先流式输出一部分内容，再以 `request_aborted` 结束；前端保留 partial content，并把状态设为 `request_aborted` |
| `5` | 输出部分内容后 upstream_interrupted | 先流式输出一部分内容，再以 `upstream_interrupted` 结束；前端保留 partial content，并把状态设为 `upstream_interrupted` |

### Mock 场景说明

- `1` 号场景不是“错误超时”，而是“首包前延迟”，主要用于测试按钮、loading、生成中状态。
- `2` 号场景用于测试服务端在开始前直接 timeout。
- `3/4/5` 号场景用于测试“已经输出部分文本后又中断”的情况。

由于纯 text stream 在 HTTP 200 开始后不能再改成 408/499/500，所以 `3/4/5` 这类“半路中断”场景通常需要 mock helper 自己带一个约定信号，让前端在读完 partial content 后把消息状态修正为对应状态。这属于测试手段，不是对底层网络语义的完全复刻。

### Mock 与线上行为的边界

Mock 的价值主要在于验证前端状态机，而不是保证线上网络语义 100% 可复刻。

线上真实请求中，下面这些能力同样成立：

- 正常流式展示。
- 用户主动停止并标记为 `stopped`。
- 首包前失败时，将消息标记为 `timeout`、`request_aborted` 或兜底错误状态。
- 保留 partial content。
- 正确渲染消息状态文案和 loading 过渡状态。

但对于“已经输出部分文本后，又需要精确区分是 `timeout`、`request_aborted` 还是 `upstream_interrupted`”这件事，纯 text stream 在线上通常做不到像 mock 那样稳定精细。

原因是：

- 一旦 HTTP 200 和响应头已经发出，后续就不能再改成 408/499/500。
- 如果中途连接断开，前端很多时候只能知道“流断了”，但拿不到结构化错误类型。

因此：

- mock 的 `3/4/5` 场景主要用于测试 UI 在“部分输出后中断”时的表现是否正确。
- 线上真实请求在“半路中断”时，通常只能稳定兜底归类到 `upstream_interrupted`，而不一定能继续精确区分。

如果业务要求线上也能稳定区分“输出部分内容后，到底是 timeout、request abort 还是 upstream error”，就不应继续只使用纯 text stream，而应升级为结构化流协议，例如 SSE、自定义事件流，或 AI SDK 的更高层流式协议。

## 实践 Checklist

- route 返回 `ReadableStream` 或 `toTextStreamResponse()`。
- mock 模式返回真实 stream，不返回普通字符串 response。
- 前端使用 `response.body.getReader()`，不使用 `response.text()`。
- stream headers 尽量关闭代理缓冲。
- 当前 assistant 消息从 `streaming` 开始。
- 正常完成设置为 `completed`。
- 用户主动停止设置为 `stopped`。
- 应用超时设置为 `timeout`。
- 请求被 abort 设置为 `request_aborted`。
- 未知上游或网络中断设置为 `upstream_interrupted`。
- 停止或中断时保留 partial content。
- 状态文案在 UI 层单独渲染，不写入 message `content`。
- 多轮上下文窗口要排除隐藏 UI/system 指令。
- prompt、mock、状态文案等主功能文本应放在 route 控制逻辑之外。
- mock helper 应独立于正常请求主逻辑，并通过开关显式进入。
