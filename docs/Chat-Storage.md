# Chat Session 存储说明

本文档总结当前项目里 chat session 的实际存储方式、前端状态流转、数据库落库结构，以及消息更新时的持久化行为。

## 总体结论

当前系统存储的不是“按条拆分的 message 表”，而是“按会话保存的一整份 session 快照”。

- 前端当前会话的真实数据源是 `localMessages`
- 数据库存储的是整个 `Session`
- 对话正文变化时，前端会把整段会话全量 `POST` 保存
- 置顶、重命名走 `PATCH`，只更新元数据
- 删除走软删除，不是物理删除

## 前端状态

前端核心类型定义在 [`src/lib/chatSession.ts`](/Users/funeye/IdeaProjects/practice-yes-and/src/lib/chatSession.ts)。

`Message` 结构：

```ts
type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  status?:
    | "streaming"
    | "completed"
    | "stopped"
    | "timeout"
    | "request_aborted"
    | "failed";
  failureReason?:
    | "invalid_request"
    | "auth_error"
    | "insufficient_credits"
    | "model_access_denied"
    | "content_blocked"
    | "rate_limited"
    | "provider_error"
    | "no_provider_available"
    | "empty_response"
    | "stream_error"
    | "unknown";
  errorMessage?: string;
  upstreamStatusCode?: number;
};
```

`Session` 结构：

```ts
type Session = {
  id: string;
  mode: "idea" | "practice";
  category: "workplace" | "relationships" | "social" | "creative" | "parenting" | null;
  messages: Message[];
  isPinned: boolean;
  sessionName: string | null;
  updatedAt: number;
};
```

在 [`src/components/hero-client.tsx`](/Users/funeye/IdeaProjects/practice-yes-and/src/components/hero-client.tsx) 中，和会话有关的核心状态包括：

- `localMessages`
- `currentSessionId`
- `mode`
- `category`
- `currentSessionName`
- `currentSessionPinned`
- `sessions`

其中：

- `localMessages` 表示当前正在进行的会话正文
- `sessions` 是左侧历史会话列表的本地缓存

## 流式消息如何更新

当用户发送消息时，前端会先插入一条空的 assistant 占位消息，然后开始流式读取 `/api/ai-generate` 的响应。

处理流程在 [`src/components/hero-client.tsx`](/Users/funeye/IdeaProjects/practice-yes-and/src/components/hero-client.tsx) 的 `sendMessage()` 中：

1. 插入一条 `status: "streaming"` 的 assistant 消息
2. 调用 `/api/ai-generate`
3. 使用 `response.body.getReader()` 逐 chunk 读取
4. 每次读到新 chunk，就更新该 assistant 消息的 `content`
5. 流结束后，将消息状态改为 `completed` 或其他终止状态

因此，当前会话在前端是通过持续更新 `localMessages` 实现的。

## 历史会话如何持久化

在 [`src/components/hero-client.tsx`](/Users/funeye/IdeaProjects/practice-yes-and/src/components/hero-client.tsx) 中，有一个 `useEffect` 负责监听会话变化并持久化。

触发条件包括：

- `localMessages` 变化
- `currentSessionId` 变化
- `mode` 或 `category` 变化
- `currentSessionName` 变化
- `currentSessionPinned` 变化

当满足以下条件时会触发保存：

- 当前存在 `currentSessionId`
- 至少有一条可持久化消息
- `isHistoryReady === true`

保存流程：

1. 先更新本地 `sessions` 列表
2. 再延迟 `500ms` 调用 `POST /api/chat-sessions`

提交的 payload 是整个 session：

```ts
{
  id,
  mode,
  category,
  messages,
  isPinned,
  sessionName
}
```

这意味着当前实现是“整段会话全量覆盖保存”，不是单条消息增量写入。

## chat-sessions API 的职责

路由定义在 [`src/app/api/chat-sessions/route.ts`](/Users/funeye/IdeaProjects/practice-yes-and/src/app/api/chat-sessions/route.ts)。

### `GET /api/chat-sessions`

返回当前用户的全部历史会话。

### `POST /api/chat-sessions`

保存完整 session。

用途：

- 新建会话
- 覆盖更新会话正文
- 同时更新 `mode`、`category`、`messages`、`isPinned`、`sessionName`

### `PATCH /api/chat-sessions`

只做元数据更新，不修改 `messages`。

当前只支持：

- `isPinned`
- `sessionName`

### `DELETE /api/chat-sessions`

删除指定会话。

当前实现是软删除。

## 聚合层如何写库

核心实现位于 [`src/services/aggregate/chatSession.aggregate.service.ts`](/Users/funeye/IdeaProjects/practice-yes-and/src/services/aggregate/chatSession.aggregate.service.ts)。

### 列表查询

`listChatSessionsForCurrentUser()`：

- 根据当前身份解析 `userId`
- 查询 `deleted = 0` 的记录
- 映射为前端使用的 `Session`

### 保存会话

`saveChatSessionForCurrentUser()`：

- 使用 Prisma `upsert`
- `where: { sessionId }`
- 不存在则创建
- 已存在则整体更新

更新字段包括：

- `userId`
- `sessionScope`
- `mode`
- `category`
- `messages`
- `isPinned`
- `sessionName`
- `deleted`

### 更新元数据

`updateChatSessionForCurrentUser()`：

- 只更新 `isPinned` 和/或 `sessionName`
- 不更新 `messages`

### 删除会话

`deleteChatSessionForCurrentUser()`：

- 按 `sessionId + userId + sessionScope` 定位记录
- 将 `deleted` 标记为删除

## 数据库表结构

Prisma 模型定义在 [`prisma/schema.prisma`](/Users/funeye/IdeaProjects/practice-yes-and/prisma/schema.prisma)。

当前表为 `yesand.chat_sessions`：

```prisma
model ChatSession {
  id           BigInt    @id @default(autoincrement())
  sessionId    String    @unique @map("session_id")
  userId       String    @map("user_id")
  sessionScope String    @map("session_scope")
  mode         String
  category     String?
  messages     Json      @default("[]")
  isPinned     Int       @default(0) @map("is_pinned")
  sessionName  String?   @map("session_name")
  createdAt    DateTime? @default(now()) @map("created_at")
  updatedAt    DateTime? @default(now()) @map("updated_at")
  deleted      Int       @default(0)
}
```

关键点：

- `messages` 是一个 `Json` 字段
- 一整个会话的全部消息都保存在这个字段里
- `isPinned` 用 `Int` 表示布尔状态
- `sessionName` 是可选自定义标题
- `deleted` 用于软删除

## messages 字段里实际存什么

数据库里的 `messages` 直接来自前端 `localMessages`，因此通常包含：

- `user` 消息
- `assistant` 消息
- `system` 消息
- 每条消息的 `status`
- 失败消息的 `failureReason`
- 失败消息的 `errorMessage`
- 上游失败时的 `upstreamStatusCode`

因为当前前端会在流式输出过程中持续更新 `localMessages`，所以数据库也可能短暂保存到：

- `status: "streaming"` 的 assistant 消息
- 尚未生成完成的 partial content
- `status: "failed"` 且带有 `failureReason/errorMessage/upstreamStatusCode` 的失败消息

这属于当前实现的自然结果，不是额外的异步补写逻辑。

## 发给模型的上下文不等于数据库原始消息

虽然数据库保存的是完整 `messages` 数组，但模型请求不会直接原样发送整库数据。

上下文构建逻辑在 [`src/lib/chatSession.ts`](/Users/funeye/IdeaProjects/practice-yes-and/src/lib/chatSession.ts) 的 `buildConversationWindow()` 中。

其行为是：

- 先过滤隐藏消息
- 再截取最近若干个 user turn
- 保留这些 user turn 之间相关的 assistant 消息

因此：

- DB 存的是完整会话快照
- 发给模型的是过滤和裁剪后的上下文窗口

## 用户身份与归属

会话不是单纯按登录用户保存，系统还区分：

- `authenticated`
- `anonymous`

身份解析逻辑在 [`src/services/aggregate/chatSession.aggregate.service.ts`](/Users/funeye/IdeaProjects/practice-yes-and/src/services/aggregate/chatSession.aggregate.service.ts) 的 `resolveCurrentChatSessionIdentity()` 中。

规则是：

- 已登录用户按真实账户 `userId` 存储
- 未登录用户通过 fingerprint 解析出匿名用户 `userId`

所以匿名用户理论上也有自己的 chat session 记录。

## 当前设计的核心特征

可以把现在的实现概括为：

- 前端内存里维护当前会话
- 流式生成时持续更新 `localMessages`
- 持久化时按整个 session 快照覆盖写库
- 历史列表与当前会话共用同一份 `Session` 结构
- 对话正文和会话元数据没有拆表

## 一句话总结

当前数据库存储的是“会话快照”，不是“消息明细表”。对话正文更新时，前端会把整段 `messages` JSON 全量写回 `chat_sessions`；只有置顶和重命名才走局部更新。
