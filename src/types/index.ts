export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  isStreaming?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
  projectPath?: string;
}

export interface Skill {
  name: string;
  description: string;
  filePath: string;
  content: string;
  isBuiltIn: boolean;
}

export interface Agent {
  name: string;
  description: string;
  filePath: string;
  content: string;
  tools?: string[];
}

export interface MemoryEntry {
  name: string;
  description: string;
  type: 'user' | 'feedback' | 'project' | 'reference';
  filePath: string;
  content: string;
}

export interface MemoryIndex {
  entries: MemoryEntry[];
  indexPath: string;
}

export interface ClaudeProcess {
  pid?: number;
  isRunning: boolean;
  executablePath: string;
}

export interface PermissionRequest {
  id: string;
  tool: string;
  description: string;
  path?: string;
}

export interface ToolUse {
  id: string;
  name: string;
  result?: string;
  isRunning: boolean;
}

export type WebviewMessageType =
  | 'sendMessage'
  | 'newConversation'
  | 'loadConversation'
  | 'deleteConversation'
  | 'getSkills'
  | 'getAgents'
  | 'getMemory'
  | 'openSkillEditor'
  | 'openAgentEditor'
  | 'pickFile'
  | 'getWorkspaceFiles'
  | 'stopStreaming'
  | 'permissionResponse'
  | 'showError'
  | 'ready'
  | 'setModel'
  | 'setMode'
  | 'setThinking'
  | 'acceptDiff'
  | 'rejectDiff'
  | 'rewind'
  | 'compact'
  | 'runCommand'
  | 'toggleSelection'
  | 'insertMention'
  | 'newSession'
  | 'openSession'
  | 'renameSession'
  | 'deleteSession'
  | 'saveSession'
  | 'setEffort'
  | 'openFile'
  | 'copyToClipboard'
  | 'questionAnswer'
  | 'fileContent';

export interface WebviewMessage {
  type: WebviewMessageType;
  payload?: unknown;
}

export type ExtensionMessageType =
  | 'messageChunk'
  | 'messageDone'
  | 'messageError'
  | 'conversationList'
  | 'skillList'
  | 'agentList'
  | 'memoryList'
  | 'conversationLoaded'
  | 'thinkingUpdate'
  | 'permissionRequest'
  | 'toolUse'
  | 'filePicked'
  | 'workspaceFiles'
  | 'diffFile'
  | 'contextUpdate'
  | 'selectionUpdate'
  | 'mentionInserted'
  | 'contextKeyUpdate'
  | 'logMessage'
  | 'newConversation'
  | 'configUpdate'
  | 'authState'
  | 'contextTokens'
  | 'loadSession'
  | 'compactStart'
  | 'compactDone'
  | 'permissionPending'
  | 'streamResumed'
  | 'askQuestion';

export interface ExtensionMessage {
  type: ExtensionMessageType;
  payload?: unknown;
}
