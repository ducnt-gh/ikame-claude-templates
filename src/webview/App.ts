import { ChatUI } from './components/ChatUI';
import { ExtensionMessage, Skill, Agent, MemoryIndex } from '../types';

interface VsCodeApi {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
}

export class App {
  private _chatUI: ChatUI;

  constructor(private readonly _vscode: VsCodeApi) {
    this._chatUI = new ChatUI(this._vscode);
  }

  mount(root: HTMLElement): void {
    root.appendChild(this._chatUI.render());
    this._vscode.postMessage({ type: 'ready' });
  }

  handleExtensionMessage(message: ExtensionMessage): void {
    switch (message.type) {
      case 'messageChunk':
        this._chatUI.appendChunk(message.payload as string);
        break;
      case 'messageDone':
        this._chatUI.finishMessage();
        break;
      case 'messageError':
        this._chatUI.showError(message.payload as string);
        break;
      case 'skillList':
        this._chatUI.updateSkills(message.payload as Skill[]);
        break;
      case 'agentList':
        this._chatUI.updateAgents(message.payload as Agent[]);
        break;
      case 'memoryList':
        this._chatUI.updateMemory(message.payload as MemoryIndex);
        break;
      case 'thinkingUpdate':
        this._chatUI.updateThinking(message.payload as string);
        break;
      case 'permissionRequest':
        this._chatUI.showPermissionRequest(message.payload as {
          items: Array<{ id: string; tool: string; path?: string }>;
        });
        break;
      case 'toolUse':
        this._chatUI.showToolUse(message.payload as {
          id: string; name: string; result?: string; running: boolean;
        });
        break;
      case 'diffFile':
        this._chatUI.showDiff(message.payload as {
          filename: string;
          lines: Array<{ type: 'add'|'del'|'ctx'; content: string; lineNum?: number }>;
          msgId?: string;
        });
        break;
      case 'contextUpdate':
        this._chatUI.updateContext(message.payload as number);
        break;
      case 'workspaceFiles':
        this._chatUI.showFileAc(message.payload as string[]);
        break;
      case 'filePicked':
        this._chatUI.addAttachedFile(message.payload as string);
        break;
      case 'selectionUpdate':
        this._chatUI.showSelectionCount(message.payload as number);
        break;
      case 'mentionInserted':
        this._chatUI.insertMentionFromEditor(message.payload as string);
        break;
      case 'newConversation':
        this._chatUI.triggerNewSession();
        break;
      case 'loadSession':
        this._chatUI.loadSessionData(message.payload as { id: string; title: string; msgs: unknown[]; createdAt: number });
        break;
      case 'configUpdate':
        this._chatUI.applyConfig(message.payload as Record<string, unknown>);
        break;
      case 'authState':
        this._chatUI.setAuthState(message.payload as 'checking'|'unauthenticated'|'authenticated');
        break;
      case 'contextTokens': {
        const t = message.payload as { used: number; total: number };
        this._chatUI.updateContextTokens(t.used, t.total);
        break;
      }
      case 'compactStart':
        this._chatUI.onCompactStart();
        break;
      case 'compactDone':
        this._chatUI.onCompactDone(message.payload as string);
        break;
      case 'permissionPending':
        this._chatUI.onPermissionPending();
        break;
      case 'streamResumed':
        this._chatUI.onStreamResumed();
        break;
      case 'askQuestion':
        this._chatUI.showAskQuestion(message.payload as {
          toolUseId: string;
          questions: Array<{
            question: string; header: string;
            options: Array<{ label: string; description?: string }>;
            multiSelect: boolean;
          }>;
        });
        break;
    }
  }
}
