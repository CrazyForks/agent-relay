# agent-relay

[![CI](https://github.com/zwx1127/agent-relay/actions/workflows/ci.yml/badge.svg)](https://github.com/zwx1127/agent-relay/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

[English](README.md) | 中文

`agent-relay` 可以让你通过 Telegram 或 Lark/飞书远程控制本地 Codex CLI agent。Codex 仍然运行在可信机器上，你可以在聊天软件里选择工作区、发送提示词、回答问题、审批操作、发起代码审查、管理线程，并收发截图或图片。

它的目标很直接：让 agent 留在代码所在的机器上，同时让你可以从常用聊天工具里操作它。

## 项目交流群

扫描下面的 Telegram 二维码加入项目交流群。

<img src="docs/assets/telegram-group-qr.jpg" alt="Telegram 群组二维码" width="240">

## 演示

<table>
  <tr>
    <th>Telegram 单聊</th>
    <th>Telegram 群聊 topic 模式</th>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <video src="https://github.com/user-attachments/assets/2109bbbf-35d5-4f10-b712-409d318fdde6" width="360" controls></video>
    </td>
    <td width="50%" valign="top">
      <video src="https://github.com/user-attachments/assets/48aca05e-20f4-47f8-ac80-d93c6a4ecf60" width="360" controls></video>
    </td>
  </tr>
  <tr>
    <th>飞书单聊</th>
    <th>飞书群聊 topic 模式</th>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <video src="https://github.com/user-attachments/assets/b3bda23d-0eb0-402b-996c-b134562e4772" width="360" controls></video>
    </td>
    <td width="50%" valign="top">
      <video src="https://github.com/user-attachments/assets/13889a04-a32b-4ef4-beae-2df48f2a674d" width="360" controls></video>
    </td>
  </tr>
</table>

## 能做什么

- 通过 Telegram 或 Lark/飞书远程控制本地 Codex 会话。
- 在聊天里选择、创建、浏览、删除工作区。
- 发送普通提示词、图片和运行中的补充指令。
- 直接在聊天里回答 Codex 问题和审批操作。
- 支持私聊和指定群聊；群聊消息只有提及 bot 时才会被处理。
- 使用 review、Plan mode、goal、resume、fork、side conversation、interrupt、后台终端清理等常见 Codex 工作流。
- 通过可选的本地能力 API，把截图或生成图片发回聊天窗口。
- 可以把多个 agent-relay bot 放在同一个群里，让 agent 提及已配置的 peer bot 协作。
- 继续扩展更多 IM provider 或 Agent backend。

## 实验性功能：接力工作

> **本功能处于实验阶段、默认关闭，并且只能手动开启。** 在正式稳定前，其接口和启用方式可能发生不兼容变化。未手动开启时，它不会启动 Gateway、安装客户端代理，也不会改变现有 Relay、Codex CLI 或 Codex 桌面版的任何行为。

“接力工作”允许你先在原生 Codex CLI 或 Windows/macOS Codex 桌面版开始工作，离开电脑后再通过 Telegram 或 Lark/飞书继续同一个 Codex thread。Relay、交互式 Codex CLI 进程和 Codex 桌面版统一连接一个独立的本地 Gateway，由其唯一 app-server 管理 thread；用户正常启动 Codex，无需选择远端入口。

![实验性接力工作架构：Codex 与 IM 通过同一 thread 双向互通实时进度和控制信息](docs/assets/relay-work-overview.png)

npm 持久安装后先执行一次 `agent-relay gateway setup`（源码方式使用 `scripts/gateway.* setup`），需要接力工作时再手动启动 Gateway。Gateway 与 Relay 使用完全独立的脚本和生命周期，而 Gateway 与唯一 app-server 属于同一故障域。使用 `/resume` 加入已有 thread。多个原生 Codex 客户端和 IM scope 可以共享同一个 thread，不设归属限制；新的用户消息、agent 进度和 Relay 支持的 thread 指令状态会同步到其他已加入的 scope，活动 turn 中的普通输入使用 Steer 语义，审批或输入请求由第一个回答的客户端胜出。Gateway 模式继承共享 Codex app-server 的配置；Relay 请求不会覆盖这些配置，唯一例外是用户明确选择 Default 或 Plan 后的一次性模式切换。有界指令快照只存在于 Gateway 内存中，可跨 Relay 重启/清理恢复，但不能跨 Gateway/app-server 重启；此时采用 Codex 原生重启语义，包括 Plan 回到 Default。它不提供 Queue 操作，不增加语义状态 journal，也不重放或事后追赶离线输出。请阅读[实验性接力工作](docs/en/experimental-relay-work.md)，了解 Windows、macOS 和 Linux 设置、生命周期语义以及完整移除方法。

## npm / npx 安装

> **发布状态：**当前代码已实现 `@asuka1127/agent-relay` 0.2.0，但此版本尚未发布到 npm。无 scope 的 `agent-relay` 属于另一个项目，请勿用 `npx agent-relay` 或 `npm install -g agent-relay` 安装本项目。正式授权发布前，请使用下面的本地 tarball 方式。

### 一条命令完成安装并进入配置（正式发布后）

该 scoped 版本正式发布后，运行：

```bash
npx @asuka1127/agent-relay install
```

这是统一的“安装并配置”入口：先预览包版本及安装位置，经确认后将当前 scoped 版本持久安装到用户自己的 npm prefix，再立即启动已安装副本的**英文配置向导**，无需另外运行 `init`。重复运行时会复用已通过运行检查的同版本安装并重新进入配置；损坏的副本会先请求确认再重新安装；显式指定 `--package` 时会重新安装该 tarball。

创建机器人和账号登录仍需手动完成。向导会引导你打开 Telegram BotFather 或飞书/Lark 开发者后台，并填写自己的凭据及操作者 ID。Codex 也需要单独安装并自行登录。保存配置不会启动 relay、替你设置平台权限/事件，或安装实验性 Gateway 代理。

### 现在即可使用：从当前代码打包安装

在包含这些 CLI 改动的代码目录中准备本地包：

```bash
npm install
npm pack
```

使用 `npm pack` 实际输出的文件名，将下面两处路径替换为该文件的真实绝对路径，再用一条命令安装并进入配置：

```bash
npx --package=/absolute/path/asuka1127-agent-relay-0.2.0.tgz agent-relay install --package /absolute/path/asuka1127-agent-relay-0.2.0.tgz
```

前一个 `--package` 告诉 npx 从哪里运行安装器，后一个告诉安装器持久安装哪个本地 tarball，避免请求尚未发布的 registry 版本。tarball 中的 scoped 包名和版本必须匹配。只使用可信的安装包：npm 会安装依赖并执行依赖的安装脚本。

### 安装位置与日常使用

默认 npm prefix 独立于源码目录及 npx 缓存：

- Linux/macOS：`$XDG_DATA_HOME/agent-relay/npm`，未设置时为 `~/.local/share/agent-relay/npm`
- Windows：`%LOCALAPPDATA%\agent-relay\npm`，未设置时为 `~\AppData\Local\agent-relay\npm`

通过 `install --prefix /absolute/path/to/private/prefix` 选择其他由自己拥有的安装目录。`--config` 和 `--env-file` 会传给向导。用户可写的 prefix 不需要管理员权限。安装器不会修改 shell 配置或 `PATH`，而是打印可以立即使用的带引号绝对路径命令。Unix 的入口为 `<prefix>/bin/agent-relay`，Windows 为 `<prefix>\agent-relay.cmd`。如需使用下文简写的 `agent-relay` 命令，请按安装器打印的可选说明手动加入 `PATH`。

npm 安装成功后，如果取消配置或保存失败，包仍会保留。使用打印的 `init` 命令重新配置；只有确认保存后才会改写已有配置。

npm 方式需要 Node.js 20+ 和 npm，包含官方 [`bun@1.3.11`](https://www.npmjs.com/package/bun/v/1.3.11) 运行时依赖、对应平台的二进制及非交互安装脚本，**无需预装全局 Bun**。运行时支持 Linux/macOS/Windows 的 x64/arm64，系统限制见 [Bun 安装文档](https://bun.com/docs/installation)。运行时二进制会增加约 100 MB 的安装体积。`install` 会显式调用 npm；正常运行的 relay 启动器不会下载程序。使用 `--ignore-scripts` 或 `--omit=optional` 可能导致 Bun 不可用，此时正常重新安装，或把 `AGENT_RELAY_BUN_PATH` 指向已安装的兼容 Bun 可执行文件。

如果希望自己管理常规 npm 全局安装，**正式发布后**也可以使用下面的替代方式。普通 `npm install -g` 不会自动打开向导：

```bash
npm install -g @asuka1127/agent-relay
agent-relay init
```

### 配置向导与日常命令

`install` 自动打开的英文向导（也可单独通过 `init` 打开）引导配置 Telegram 或飞书/Lark 机器人、凭据、用户/会话白名单、工作区根目录、SQLite 状态文件、Codex 可执行文件、沙箱及审批选项，并可选择启用本地 helper 或实验性 Gateway 开关。Secret 输入会被掩码；只有明确同意后，才会把凭据发送到所选平台的官方 API 做只读检查。检查不能证明消息链路、权限或应用发布已经完成。向导不会自动创建机器人、修改 webhook、安装 Gateway 代理或启动 relay。保存后先运行 `doctor`、再 `start`，向机器人发送 `/relay` 做端到端验证。

- Telegram：通过官方 [BotFather](https://t.me/BotFather) 创建机器人，填入 token 和本人数字 user ID。可选检查仅调用 `getMe`、`getWebhookInfo`，不会消费 `getUpdates` 或删除已有 webhook
- 飞书/Lark：在对应区域的开发者后台创建自建应用，启用机器人能力，填入 App ID/Secret 和该应用专属的 `open_id` 白名单。先保存配置并启动 relay，再在控制台保存长连接消息事件与卡片回调，完成权限、版本发布及可用范围设置，详见[飞书/Lark 指南](docs/en/quickstart-lark.md)。凭据有效不等于这些步骤已完成
- `agent-relay` 或 `agent-relay start`：以前台方式运行；无配置且有交互终端时，进入首次配置向导，保存后退出，再运行 `start` 才会连接机器人
- `agent-relay install`：持久安装后立即进入配置；安装和保存配置分别需要确认
- `agent-relay init`：首次配置或重新配置；Ctrl+C 或拒绝保存不会改写已有文件
- `agent-relay doctor`：检查本地配置、路径和 Codex 版本，不访问机器人 API
- `agent-relay config path`：仅显示配置文件位置，不显示 secret
- `agent-relay gateway <setup|start|stop|status|remove>`：显式管理实验性 Gateway。长期运行 Gateway 请使用 `install` 创建的持久安装或自行管理的 npm 全局安装，避免 npx 缓存被清理；移动/升级安装位置后，按 [Gateway 指南](docs/en/experimental-relay-work.md) 重新 setup

配置保存在安装包和工作区之外：Linux/macOS 默认 `$XDG_CONFIG_HOME/agent-relay/config.json` 或 `~/.config/agent-relay/config.json`；Windows 为 `%APPDATA%\agent-relay\config.json`。用 `--config /absolute/path/config.json` 或 `AGENT_RELAY_CONFIG` 指定其他位置。POSIX 下新建目录权限为 0700，配置以 0600 原子写入；对于已有的共享目录会拒绝保存，不会擅自修改目录权限。Windows 下应存放在自己的用户目录，并使用仅本人可访问的 ACL。配置内的凭据以明文保存，切勿提交或分享。

向导保存的 workspace/SQLite 路径均为绝对路径，不随启动目录变化。默认状态文件位于配置旁的 `state/agent-relay.sqlite`；工作区根目录应该是代码/项目目录，不是 npm 安装目录。shell 环境变量优先于保存的配置。新 CLI 不会自动读取当前启动目录中的 `.env`。

从源码方式迁移已有配置（不会改写原 `.env`）：

```bash
agent-relay init --env-file /absolute/path/to/agent-relay/.env
# 或只使用该文件启动一次，不写入用户配置：
agent-relay start --env-file /absolute/path/to/agent-relay/.env
```

仅迁移已知的 relay 设置；相对文件路径以显式 `.env` 所在目录为基准。该次运行中 `--env-file` 替代用户配置文件作为来源，shell 环境变量仍优先。非交互/CI 场景不会弹出向导：先准备好私有配置或 `.env`，再指定路径运行。不要把 secret 放到命令行参数中。

### 从源码运行（保留原方式）

```bash
git clone https://github.com/zwx1127/agent-relay.git
cd agent-relay
bun install
bun run init
bun run cli start
```

原 `.env` 工作流仍可用：复制 `.env.example` 为 `.env`，编辑后运行 `bun run start`。源码 `bun run start` 继续读取当前源码目录的 `.env`；`bun run cli start` 则使用新的用户级配置。`scripts/relay.*` 生命周期脚本仍仅服务源码目录，不随 npm 包安装；npm 安装后可将前台 CLI 交给自己的进程管理器。

## 使用指南

除本 README 外，项目文档、配置向导和用户界面均使用英文；以下链接指向维护中的英文指南。

- [Telegram 快速上手](docs/en/quickstart-telegram.md)
- [Lark/飞书快速上手](docs/en/quickstart-lark.md)
- [常见问题排查](docs/en/troubleshooting.md)
- [扩展 agent-relay](docs/en/extending-agent-relay.md)
- [实验性接力工作](docs/en/experimental-relay-work.md)（默认关闭）

## 最低要求

- npm/npx 方式需要 Node.js 20+ 和 npm；源码方式需要 Bun 1.3+（npm 安装包自带固定版本的 Bun 运行时）。
- Git。
- 本地可用的 `codex` CLI，或通过 `CODEX_BIN` 指定完整路径。
- Codex CLI 0.145.0 或更高版本需要支持 `codex app-server --listen stdio://`；实验代理会在内部使用 CLI 的 WebSocket 传输，用户不再选择单独的 remote 模式。
- Telegram bot token，或 Lark/飞书自建应用。

## 日常使用

先发送 `/relay`。Relay Home 会显示当前工作区、Codex 状态、等待状态、最近错误和可用操作。

常用命令：

| 命令 | 用途 |
| --- | --- |
| `/help` | 查看支持的命令。 |
| `/relay` | 打开 Relay Home。 |
| `/review` | 审查当前工作区改动。 |
| `/plan` | 为当前 Codex 线程切换 Plan mode。 |
| `/plan --on` / `/plan --off` | 显式选择 Plan 或 Default mode。 |
| `/plan <prompt>` | 进入 Plan mode 并执行提示词。 |
| `/goal <objective>` | 为当前 Codex 线程设置目标。 |
| `/resume` | 选择最近的 Codex 线程，并立即显示其最新 turn 状态。 |
| `/side <prompt>` | 发起临时 side conversation。 |
| Activity/Goal 卡片按钮 | 中断当前 turn 或管理 Goal；按钮文案保持英文。 |
| `/ps` | 查看 Codex 后台终端。 |
| `/stop` | 要求 Codex 清理后台终端。 |

在群聊里发送文本、图片或 slash command 时，需要提及 bot。普通 bot 提及应作为独立 token 使用，例如 `/relay @relay_bot` 或 `@relay_bot review this change`；Telegram 原生的 `/relay@relay_bot` 命令格式也会兼容。如果 bot 只应该在指定群里工作，请配置 `ALLOWED_CONVERSATION_IDS`。

## 群聊和 agent 团队

agent-relay 支持私聊，也支持群聊。群聊适合作为一个共享的 agent 操作室。

- 把 bot 加入群聊，并用 `ALLOWED_CONVERSATION_IDS` 允许这个群。
- 发送文本、图片 caption 和 slash command 时提及 bot；普通 `@bot` 或 `@BotName` 前后用空格分隔。
- 未提及 bot 的群聊消息会在授权检查前被忽略。
- Telegram 论坛话题和 Lark/飞书线程会被视为独立 scope，因此同一个群里的不同话题或线程可以各自选择 workspace，并行运行独立 Codex 会话。
- 如果希望多个 agent 在同一个群里协作，每个 agent bot 运行一个 agent-relay 进程。
- 如果希望 Codex 主动提及另一个 agent bot，需要配置 peer agents 并开启本地 relay 能力 API。

Telegram 和 Lark/飞书快速上手文档里有更具体的群聊配置步骤。

## 用它扩展它自己

agent-relay 的一个重要用法，是用正在运行的 agent-relay 远程迭代 agent-relay 本身。

1. 把这个仓库作为当前工作区启动 agent-relay。
2. 在 Telegram 或 Lark/飞书里要求 Codex 增加新的 IM provider 或 Agent backend。
3. 让 Codex 参考现有 provider 接口和实现。
4. 要求它同步更新配置、工厂、文档和测试。
5. 在聊天里触发 `bun run typecheck` 和 `bun test` 验证。

主要扩展点：

- IM provider：`src/ports/im.ts` 和 `src/providers/im/`。
- Agent provider：`src/ports/agent.ts` 和 `src/providers/agents/`。
- agent 可见的本地能力：`src/relay/capabilities/`。

更多流程见 [扩展 agent-relay](docs/en/extending-agent-relay.md)。

## 项目状态

当前 provider：

- IM：Telegram、Lark/飞书。
- Agent：Codex CLI app-server。
- 存储：SQLite。

已知限制：

- 暂不支持文件夹附件及自动解压。
- 当前 npm 版本尚未发布；发布验证完成前，请使用上面的本地 tarball 或源码方式。
- 当前只有 Codex 这一种 Agent backend。

## 贡献和支持

- 提交 PR 前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 报告敏感问题前请阅读 [SECURITY.md](SECURITY.md)。
- 提交安装或运行问题前，请先查看 [常见问题排查](docs/en/troubleshooting.md)。
- 版本记录见 [CHANGELOG.md](CHANGELOG.md)。

## 许可证

`agent-relay` 使用 [MIT License](LICENSE) 授权。
