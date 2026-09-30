# Telegram 快速开始

通过 Telegram 控制可信电脑上的本地 Codex。

## 1. 安装并准备工具

先按 [npm/npx 安装说明](../../README.zh-CN.md#npm--npx-安装) 安装，注意尚未发布时需要使用本地 tarball。npm/npx 已包含官方 Bun 运行时；源码方式需要 Bun 1.3+。另外安装 Codex CLI 0.145.0+，在这台电脑上自行登录，准备日常代码操作所需的 Git。

```bash
codex --version
agent-relay init
```

源码用户可用 `bun run init`，之后 `bun run cli start`；原 `.env` + `bun run start` 流程继续有效。

## 2. 创建机器人并运行向导

1. 打开官方 [BotFather](https://t.me/BotFather)，发送 `/newbot`，设置名称和唯一 username
2. 将 token 填入向导的本地掩码输入框。不要放进 URL、命令行参数、工单或发送给其他机器人
3. 选择 Telegram，填入允许操作的本人数字 user ID，可选填写 chat ID。username 和机器人本身的 ID 都不是操作者 ID。通过可信来源获取自己的 ID，不要向 ID 查询服务提供 token
4. 配置工作区根目录、单独的状态文件和 Codex 可执行文件，保留 workspace-write/on-request 或更严格的设置
5. 只有你明确选择验证后，token 才会发送到 `api.telegram.org` 的 [`getMe`](https://core.telegram.org/bots/api#getme) 和 [`getWebhookInfo`](https://core.telegram.org/bots/api#getwebhookinfo)；不会消费待处理更新或修改 webhook
6. 如果存在 webhook，请自行检查原有集成是否应停用，或使用另一个机器人。向导不会删除 webhook。同一 token 应只有一个轮询进程
7. 检查隐藏凭据后的摘要，确认保存私有配置。可以保存未验证或验证失败的配置供之后修正，但这不代表机器人已经可用

## 3. 启动并验证

```bash
agent-relay doctor
agent-relay start
```

`doctor` 只检查本地条件，不测试机器人凭据、Codex 登录或消息链路。启动 relay 后，与机器人私聊发送 `/relay`，选择工作区，发送普通消息并测试卡片按钮。**现有 Telegram 运行时会在启动时跳过旧的排队消息**，请启动后再发一条新消息；配置向导的凭据检查不会执行这一步。

配置不在 npm 包或缓存内，workspace/state 均保存绝对路径。位置和迁移见 [README](../../README.zh-CN.md#配置向导与日常命令)。如需单次使用原源码 `.env`，可运行 `agent-relay start --env-file /absolute/path/.env`。

## 4. 可选群聊配置

先保持 [privacy mode](https://core.telegram.org/bots/features#privacy-mode) 开启做初次验证，显式指定机器人的 `/relay@bot_username` 可用。普通文字 @mention 和媒体 caption 不保证仅因 relay 支持就能送达。若需要完整群聊交互，在 BotFather 选择 `/setprivacy` → Disable 并重新把机器人加入群：**Telegram 此后会把所有群消息交给机器人**，relay 仍会忽略未提及它的消息。不要仅为绕过此问题而赋予群管理员权限。

群聊使用时：

1. 把 bot 加入群聊。
2. 将 `ALLOWED_CONVERSATION_IDS` 设置为这个群的 chat ID。
3. 如果当前环境中 bot username 自动发现不稳定，可以手动配置 `TELEGRAM_BOT_USERNAME`。
4. 发送文本、图片 caption 和 slash command 时提及 bot。普通 `@bot` 提及需要用空格分隔，例如 `/relay @relay_bot` 或 `@relay_bot inspect this`。

未提及 bot 的群聊消息会在授权检查前被忽略，因此普通群消息不会触发 relay。

## 5. 启动和使用

```bash
agent-relay start
```

然后在 Telegram 里：

1. 向 bot 发送 `/relay`。
2. 选择或创建工作区。
3. 像平常一样向 Codex 发送消息。
4. 用按钮回答问题或审批操作。

在群聊里发送文本、图片或 slash command 时，需要提及 bot。普通 `@bot` 前后需要用空格分隔；Telegram 原生的 `/relay@relay_bot` 命令格式也会兼容。

## 6. Topic 和多 workspace 用法

在 Telegram 论坛群组中，每个 topic 都是独立的 relay scope。`ALLOWED_CONVERSATION_IDS` 仍然配置群聊 chat ID，不配置 topic ID。

多 workspace 并行使用时：

1. 在 Telegram 群组里开启 Topics。
2. 按 workspace 或工作流创建不同 topic。
3. 在每个 topic 中发送 `/relay@relay_bot`，或其它 Telegram 会投递给 bot 的定向命令。
4. 在该 topic 的 Relay Home 中选择 workspace。
5. 分别在不同 topic 中发送提示词。回复、按钮、任务和 Codex 输出都会留在对应 topic 内。

从 Relay Home 停止会话时，只会停止当前 topic 的 session，并清除当前 topic 的 workspace 绑定。同群里的其它 topic 会保留各自的 session。

## 常用命令

- `/help`：查看命令。
- `/review`：审查工作区改动。
- `/plan`：为当前 Codex 线程切换 Plan mode。
- `/plan --on` / `/plan --off`：显式选择 Plan 或 Default mode。
- `/plan <prompt>`：进入 Plan mode，让 Codex 先制定计划。
- 最新活动卡上的 `Interrupt`：中断当前 turn。Goal 卡会按状态提供 `Pause`、`Resume`、`Edit`、`Clear`。
- `/resume`：恢复之前的线程。

如果配置失败，请看 [常见问题排查](troubleshooting.md)。
