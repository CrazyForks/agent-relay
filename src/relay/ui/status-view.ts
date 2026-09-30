import type { AgentTokenUsage } from "../../ports/agent.ts";

export interface StatusView {
  workspaceName?: string;
  workspacePath?: string;
  running?: boolean;
  recentOutputAt?: number;
  recentWarning?: string;
  recentError?: string;
  threadId?: string;
  threadName?: string;
  threadStatus?: string;
  model?: string;
  modelProvider?: string;
  reasoningEffort?: string | null;
  approvalPolicy?: string;
  approvalsReviewer?: string;
  sandboxPolicy?: string;
  tokenUsage?: AgentTokenUsage;
  contextWindow?: number;
  waitingForUserInput?: boolean;
  waitingForApproval?: boolean;
  waitingTaskCount?: number;
  queuedTaskCount?: number;
  blockedTaskCount?: number;
  activeTaskId?: number;
  activeTaskStatus?: string;
}
