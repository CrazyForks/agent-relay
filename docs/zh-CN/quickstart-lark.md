# 飞书 / Lark 快速开始

使用开启机器人能力的企业自建应用，不是仅支持群 webhook 的自定义机器人。

## 1. 安装并选择区域

先按 [npm/npx 安装说明](../../README.zh-CN.md#npm--npx-安装) 操作，注意未发布时使用本地 tarball。npm/npx 包含 Bun；源码方式需要 Bun 1.3+。另外安装并登录 Codex CLI 0.145.0+。

```bash
codex --version
agent-relay init
```

中国飞书选择 [open.feishu.cn/app](https://open.feishu.cn/app)，国际 Lark 选择 [open.larksuite.com/app](https://open.larksuite.com/app)，凭据必须与区域对应。源码可用 `bun run init` / `bun run cli start`，原 `.env` + `bun run start` 也保留。

## 2. 创建应用，收集凭据和 ID

1. 创建企业自建应用，在应用能力中启用**机器人**，从凭证与基础信息复制 App ID 和 App Secret，填入本地向导，Secret 输入会被掩码
2. 文本及交互卡片使用应用/租户身份权限：`im:message.p2p_msg:readonly`（单聊）、`im:message:send_as_bot`（以机器人发送）、需要群聊时增加 `im:message.group_at_msg:readonly`。无需为了配置而申请以用户身份发送或广泛通讯录访问权限
3. 操作者白名单使用**当前应用专属**的 `open_id`（`ou_...`）。同一人在不同应用的 open_id 不同，不能替换为 user_id/union_id。按官方 [Open ID 指南](https://open.feishu.cn/document/faq/trouble-shooting/how-to-obtain-openid)，进入 API Explorer → 选择当前应用 → 发送消息 → open_id → 快速复制 open_id → 选择自己；只复制 ID 不需要真的发送测试消息。会话白名单使用 `chat_id`（`oc_...`）
4. 完成工作区、状态、Codex 设置。只有明确同意后，向导才会向所选区域官方 [`tenant_access_token/internal`](https://open.feishu.cn/document/server-docs/authentication-management/access-token/tenant_access_token_internal) 发送 App ID/Secret，返回的临时 token 不保存。成功只说明凭据有效，不代表机器人能力、事件、权限、发布或可用范围已完成
5. 保存私有配置，不要提交到 Git。长连接流程无需另行收集 OAuth 凭据、Encrypt Key 或 Verification Token

按实际功能额外申请：

- 上传/发送图片及文件：`im:resource`
- 下载收到消息中的图片/文件：`im:message:readonly`，这是较广的读消息权限，仅在需要收附件时启用
- 任务状态表情回应：`im:message.reactions:write_only`

最小文本/卡片权限不覆盖全部附件或表情功能。参考官方[消息资源下载](https://open.feishu.cn/document/server-docs/im-v1/message/get-2)及 [Lark IM 权限表](https://github.com/larksuite/cli/blob/main/skills/lark-im/SKILL.md)。

## 3. 先启动连接，再完成控制台配置

**保存长连接订阅时必须有本地客户端在线**，不要等全部订阅配置完成后才首次启动。

```bash
agent-relay doctor
agent-relay start
```

如果首次查询机器人身份阻止建立连接，先发布包含机器人能力和必要权限的初始版本，然后启动 relay。保持它运行，分别完成：

1. 开发配置 → 事件与回调 → **事件配置**：选择使用长连接接收事件，添加接收消息 v2.0 / `im.message.receive_v1`
2. 单独进入**回调配置**：选择使用长连接接收回调，添加卡片回传交互 / `card.action.trigger`
3. 版本管理与发布：创建并发布版本，按租户要求完成管理员审批；应用可用范围只加入预期操作者，不要默认扩到所有人。修改权限/能力/订阅后重新发布
4. 在飞书/Lark 中找到机器人，私聊发送 `/relay`，测试文字和卡片按钮。应用可用范围与 relay 本地白名单必须同时满足

无需公网 callback URL 或隧道。`doctor` 仅做本地检查。文字正常但按钮无反应时，先检查**回调配置**；找不到应用或不能给自己发消息时，检查发布、审批和可用范围。初次配置只运行一个 relay，多个长连接客户端可能分摊事件，并非全部广播。

官方参考：[交互卡片机器人配置](https://open.feishu.cn/document/uAjLw4CM/uMzNwEjLzcDMx4yM3ATM/develop-a-card-interactive-bot/faqs)、[长连接配置](https://open.feishu.cn/document/server-docs/event-subscription-guide/event-subscription-configure-/request-url-configuration-case)、[接收消息事件](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive)。

## 4. 可选群聊配置

群聊使用时：

1. 把 bot 加入群聊。
2. `ALLOWED_USER_IDS` 使用发送者 `open_id`。
3. `ALLOWED_CONVERSATION_IDS` 使用群聊 `chat_id`。
4. 发送文本、图片 caption 和 slash command 时提及 bot。普通 `@BotName` 需要用空格分隔，例如 `/relay @RelayBot` 或 `@RelayBot inspect this`。

未提及 bot 的群聊消息会在授权检查前被忽略，因此普通群消息不会触发 relay。

## 5. 启动和使用

```bash
agent-relay start
```

然后在 Lark 或飞书里：

1. 向 bot 发送 `/relay`。
2. 选择或创建工作区。
3. 像平常一样向 Codex 发送消息。
4. 用卡片按钮回答问题或审批操作。

在群聊里发送文本、图片 caption 或 slash command 时，需要提及 bot。`@BotName` 应作为独立 token，前后用空格分隔。

## 6. Thread 和多 workspace 用法

在 Lark 或飞书群聊中，每个消息 thread 都是独立的 relay scope。`ALLOWED_CONVERSATION_IDS` 仍然配置群聊 `chat_id`，不配置 thread ID。

多 workspace 并行使用时：

1. 按 workspace 或工作流创建不同 thread。
2. 在 thread 中提及 bot 并发送 `/relay`。
3. 在该 thread 的 Relay Home 中选择 workspace。
4. 分别在不同 thread 中发送提示词。回复、卡片按钮、任务和 Codex 输出都会留在对应 thread 内。

从 Relay Home 停止会话时，只会停止当前 thread 的 session，并清除当前 thread 的 workspace 绑定。同群里的其它 thread 会保留各自的 session。

## 常用命令

- `/help`：查看命令。
- `/review`：审查工作区改动。
- `/plan`：为当前 Codex 线程切换 Plan mode。
- `/plan --on` / `/plan --off`：显式选择 Plan 或 Default mode。
- `/plan <prompt>`：进入 Plan mode，让 Codex 先制定计划。
- 最新活动卡上的 `Interrupt`：中断当前 turn。Goal 卡会按状态提供 `Pause`、`Resume`、`Edit`、`Clear`。
- `/resume`：恢复之前的线程。

如果配置失败，请看 [常见问题排查](troubleshooting.md)。
