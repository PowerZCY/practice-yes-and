# AI 架构设计

本文档描述一套面向后续项目复用的 AI Conversation Runtime 架构。它不是某个页面的接口说明，也不是某个业务场景的 prompt 设计，而是一个以 OpenRouter 为基础 AI 服务的通用对话运行时设计。

现有的流式响应细节见 [Openrouter-Stream.md](./Openrouter-Stream.md)。本文档聚焦更上层的架构边界、模块职责和最终形态。

## 设计立场

AI 调用能力不应该被理解为“封装一个 OpenRouter API route”。对于 AI 应用，它更接近一个基础运行时：

```text
AI Conversation Runtime
```

它负责：

- 会话边界。
- 消息状态。
- 流式协议。
- 多轮上下文。
- 滑动窗口。
- 摘要记忆。
- 存储策略。
- Mock 场景。
- OpenRouter 调用。
- Prompt / 内容管理。
- 中断、超时、错误分类。

具体业务产品只是在这个 runtime 上配置：

- 业务 prompt。
- 模型选择。
- 可用功能。
- 上下文策略。
- 存储策略。
- UI 形态。

## OpenRouter-first

本架构明确以 OpenRouter 作为基础 AI 服务，不再额外抽象为 provider-agnostic 设计。

原因：

- OpenRouter 本身已经是多模型聚合层。
- 模型选择、供应商路由、provider options 可以通过 OpenRouter 承担。
- 应用层再抽一层 OpenAI / Anthropic / local provider adapter，短期收益不高，反而会使设计发散。

推荐分层：

```text
Application
  -> AI Conversation Runtime
    -> OpenRouter Client
      -> Models / Providers routed by OpenRouter
```

应用层需要关心的是：

- `modelName`
- OpenRouter API key
- OpenRouter headers
- OpenRouter provider options
- `session_id`
- stream behavior
- timeout
- error type

不建议在当前架构里再引入通用 model provider router。

## 核心模块

推荐的核心模块如下：

```text
AI Conversation Runtime
  - Session Layer
  - Message State Layer
  - Stream Protocol Layer
  - Context Builder Layer
  - Memory Layer
  - Storage Strategy Layer
  - Mock Scenario Layer
  - Prompt / Content Layer
  - OpenRouter Client Layer
```

这些模块的目标不是一次性实现所有复杂能力，而是先把边界设计正确。具体项目可以按需要裁剪启用，但不应把模块职责混在一个 route 或一个组件里。

## Session Layer

所有 AI 应用都应该有 session 概念，即使不长期落库，也应该有运行期 session。

推荐抽象：

```ts
type ConversationSession = {
  id: string;
  userId?: string;
  mode?: string;
  createdAt: number;
  updatedAt: number;
  messages: ConversationMessage[];
  memory?: ConversationMemory;
  metadata?: Record<string, unknown>;
};
```

session 的作用：

- 定义多轮对话边界。
- 绑定 recent window。
- 绑定 summary memory。
- 绑定用户主动停止和当前生成状态。
- 支持用户回到同一个对话继续上下文。

## Message State Layer

通用消息模型不应只设计成 `{ role, content: string }`。为了支持未来多模态和工具调用，应至少预留结构化 content 的可能。

推荐抽象：

```ts
type ConversationMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: MessageContent[];
  status?: MessageStatus;
  createdAt: number;
  metadata?: Record<string, unknown>;
};

type MessageStatus =
  | "streaming"
  | "completed"
  | "stopped"
  | "timeout"
  | "request_aborted"
  | "upstream_interrupted";
```

推荐的 content 抽象：

```ts
type MessageContent =
  | { type: "text"; text: string }
  | { type: "image"; url: string }
  | { type: "file"; url: string; mimeType?: string }
  | { type: "audio"; url: string }
  | { type: "tool-result"; toolName: string; result: unknown };
```

当前项目可以继续使用纯文本 `content`，但通用架构应避免把最终形态锁死在 string 上。

重要原则：

```text
前端消息 != 模型输入消息
```

前端消息可以包含状态、UI 元信息、metadata；模型输入只应该包含模型需要理解的上下文。

## Stream Protocol Layer

流式协议是该架构的重点。

建议定义两级协议：

```text
Basic Protocol: text stream
Advanced Protocol: structured stream
```

### Basic Protocol: text stream

当前项目使用的是 text stream。

优点：

- 简单。
- 易于接入 OpenRouter + AI SDK。
- 前端直接拼接文本。
- 适合纯文本问答。

限制：

- HTTP 200 开始后不能再改成 408 / 499 / 500。
- 半路中断时，错误类型不一定能准确传给前端。
- tool call、多模态、sources、reasoning 等信息不好表达。
- 状态事件只能依赖额外约定或前端兜底。

### Advanced Protocol: structured stream

如果该模块要演进成通用多模态终端能力，推荐目标形态是结构化流。

示例事件：

```ts
type AIStreamEvent =
  | { type: "message_start"; messageId: string }
  | { type: "text_delta"; messageId: string; text: string }
  | { type: "message_status"; messageId: string; status: MessageStatus }
  | { type: "error"; messageId: string; errorType: string; message?: string }
  | { type: "message_end"; messageId: string };
```

未来可扩展：

```ts
type ExtendedAIStreamEvent =
  | AIStreamEvent
  | { type: "tool_call"; toolCallId: string; name: string; input: unknown }
  | { type: "tool_result"; toolCallId: string; result: unknown }
  | { type: "source"; source: unknown }
  | { type: "image_delta"; data: unknown }
  | { type: "audio_delta"; data: unknown };
```

结构化流的价值：

- 半路失败时可以显式发送状态事件。
- tool call 和 tool result 有清晰事件模型。
- 多模态输出更容易扩展。
- 前端状态机更可控。
- 对“模型输出”和“运行时事件”的区分更清楚。

## Context Builder Layer

Context Builder 是多轮对话的核心。业务代码不应该随意拼接 messages，而应通过统一上下文构建器。

输入：

```ts
type ContextBuildInput = {
  systemPrompt: string;
  messages: ConversationMessage[];
  memory?: ConversationMemory;
  maxRecentTurns: number;
  tokenBudget?: number;
};
```

输出：

```ts
type ModelMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: unknown;
};
```

Context Builder 负责：

- 过滤隐藏 UI 指令。
- 过滤状态文案。
- 过滤不应进入模型上下文的 metadata。
- 构建滑动窗口。
- 注入 summary memory。
- 控制 token budget。
- 处理多模态消息。
- 拼接 system / developer / tool instructions。

## Memory Layer

推荐采用：

```text
recent window + summary memory
```

滑动窗口负责短期上下文和最近语气；summary memory 负责长期上下文压缩。

推荐抽象：

```ts
type ConversationMemory = {
  summary?: string;
  facts?: string[];
  preferences?: string[];
  decisions?: string[];
  unresolvedQuestions?: string[];
  updatedAt: number;
};
```

### 摘要由谁生成

默认由 AI 生成。它应该是独立的 summarizer 调用，而不是混在主回复调用里。

```text
Main Model: 回答用户
Summary Model: 压缩会话记忆
```

Summary Model 可以更便宜、更快，但 prompt 必须严格，避免记忆漂移。

### 摘要触发时机

触发时机不应绑定数据库，而应绑定上下文状态。

推荐触发条件：

- 超过 `N` 个 user turns。
- 估算 token 超过阈值。
- session idle 后后台压缩。
- 主请求前发现上下文超出 token budget。
- 每次 assistant 完成后异步判断是否需要压缩。

推荐策略：

```text
正常情况：主回复完成后异步摘要
超预算情况：主请求前同步压缩或强裁剪
```

### 摘要参与上下文

后续模型输入推荐结构：

```text
system prompt
+ conversation summary
+ recent message window
```

## Storage Strategy Layer

存储策略只定义三类：

```ts
type ConversationStorageMode =
  | "browser"
  | "redis"
  | "database";
```

### Browser Storage

适合：

- 轻量会话。
- 用户本地恢复。
- 不希望后端保存原始对话。
- 无登录或弱登录场景。

特点：

- 实现简单。
- 不跨设备。
- 用户清缓存会丢。
- 不适合后端异步摘要任务。

### Redis Storage

适合：

- 短期 session memory。
- 流式状态临时缓存。
- 跨请求上下文。
- 摘要任务队列或短期缓存。

特点：

- 适合作为运行时记忆层。
- 可以设置 TTL。
- 不适合长期历史。
- 对异步 summary 比 browser storage 更友好。

### Backend DB Storage

适合：

- 长期会话历史。
- 跨设备恢复。
- 用户历史记录。
- 数据分析或质量评估。
- 审计或合规需求。

特点：

- 能力最完整。
- 成本和治理要求最高。
- 适合真正 chat 产品或对话历史有业务价值的产品。

## 对话数据的价值

对话数据是 AI 上层应用的核心资产，但不一定必须以原文长期保存。

它的价值包括：

- 理解用户真实任务。
- 发现模型失败模式。
- 优化 prompt。
- 评估模型选择。
- 改进产品路径。
- 构建 eval 样本。
- 做安全与合规审计。
- 做个性化记忆。

同时它也有风险：

- 隐私。
- 敏感信息。
- 合规。
- 存储成本。
- 用户信任。
- 删除和导出要求。

推荐分层处理：

```text
Raw Conversation: 原始对话，短期或按用户授权保留
Summary Memory: 长期上下文，压缩和去敏
Analytics Events: 产品分析，尽量结构化和脱敏
Eval Samples: 人工筛选或脱敏后进入评测集
```

## Mock Scenario Layer

Mock 是开发/测试行为，应该与正常请求主逻辑剥离。

推荐原则：

- route 中先通过 `OPENROUTER_ENABLE_MOCK` 判断是否允许 mock。
- 只有开关为真时，才进入独立 mock helper。
- mock helper 内部通过 `OPENROUTER_MOCK_TYPE` 数字场景切换。

mock 的目标是验证前端状态机，而不是 100% 复刻真实网络语义。

建议场景：

```text
0: 正常 mock 流式成功
1: 首包前延迟后正常成功
2: 立即 timeout
3: 输出部分内容后 timeout
4: 输出部分内容后 request_aborted
5: 输出部分内容后 upstream_interrupted
```

纯 text stream 在 HTTP 200 发出后不能再修改 HTTP status，因此 3 / 4 / 5 这类场景如果要在 mock 中稳定区分，通常需要额外约定信号。这是测试手段，不代表线上一定能同样精确分类。

## Prompt / Content Layer

主功能文案应从 route/control-flow 代码中抽离：

- System prompts。
- Practice start prompts。
- Mock model responses。
- 用户可见状态文案。
- 驱动 UI 行为的 API error reason constants。

不要过度抽象日志文案或临时 debug label。日志属于辅助功能，不是 AI 请求/响应的主功能路径。

## 部署与日志边界

本架构不单独设计观测平台。

当前项目部署在 Vercel，后续也可能部署到 Cloudflare、Google Cloud、AWS 等平台。这些平台本身提供日志、错误、指标或 trace 能力。

AI Conversation Runtime 的职责是：

- 输出清晰的错误类型。
- 保留必要日志。
- 让请求、session、状态变化可被平台日志捕获。

不建议在该模块内建设独立 observability 系统。

## 当前落地建议

当前项目已经具备：

- OpenRouter text stream。
- 前端流式消费。
- 消息状态机。
- 用户主动停止。
- timeout / request_aborted / upstream_interrupted 分类。
- mock 场景。
- 滑动窗口上下文。
- 主功能文案抽离。

下一步更适合推进：

1. 抽 Context Builder。
2. 引入 Summary Memory。
3. 明确 Storage Strategy。
4. 评估是否需要从 text stream 升级为 structured stream。

推进方式不是“先乱做，后重构”，而是：

```text
按最终架构分层，逐步替换内部实现
```
