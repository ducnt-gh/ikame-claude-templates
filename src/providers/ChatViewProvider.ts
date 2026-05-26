import * as vscode from 'vscode';
import { SkillManager } from '../managers/SkillManager';
import { AgentManager } from '../managers/AgentManager';
import { MemoryManager } from '../managers/MemoryManager';
import { ClaudeProcessManager } from '../managers/ClaudeProcessManager';
import { PanelViewProvider } from './PanelViewProvider';

export interface Session {
  id: string;
  title: string;
  msgs: unknown[];
  createdAt: number;
  claudeSessionId?: string;  // CLI session ID for --resume
  ctxPct?: number;           // last known context usage % (0-100)
  ctxTotal?: number;         // context window size in tokens
}

const STATE_KEY = 'ikame-claude.sessions';
const STATE_KEY_ACTIVE = 'ikame-claude.activeSessionId';

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewId = 'ikame-claude.chatView';

  private _view?: vscode.WebviewView;
  private _outputChannel?: vscode.OutputChannel;
  private _sessions: Session[] = [];
  private _activeSessionId: string | null = null;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _skillManager: SkillManager,
    private readonly _agentManager: AgentManager,
    private readonly _memoryManager: MemoryManager,
    private readonly _processManager: ClaudeProcessManager,
    private readonly _globalState: vscode.Memento
  ) {
    // Load persisted sessions on startup
    this._sessions = this._globalState.get<Session[]>(STATE_KEY, []);
    this._activeSessionId = this._globalState.get<string | null>(STATE_KEY_ACTIVE, null);
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview'),
        vscode.Uri.joinPath(this._extensionUri, 'resources'),
      ],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(msg => this._handleMessage(msg));
  }

  private _handleMessage(message: { type: string; payload?: unknown }): void {
    switch (message.type) {
      case 'ready':
        this._pushSessionList();
        break;

      case 'newSession':
        this._openNewSession();
        break;

      case 'openSession': {
        const id = message.payload as string;
        const session = this._sessions.find(s => s.id === id);
        if (session) {
          this._activeSessionId = id;
          this._pushSessionList();
          PanelViewProvider.open(
            this._extensionUri, this._skillManager, this._agentManager,
            this._memoryManager, this._processManager, session,
            (s) => this.syncSession(s), this._outputChannel
          );
        }
        break;
      }

      case 'renameSession': {
        const { id, title } = message.payload as { id: string; title: string };
        const s = this._sessions.find(x => x.id === id);
        if (s) { s.title = title; this._pushSessionList(); }
        break;
      }

      case 'deleteSession': {
        const id = message.payload as string;
        this._sessions = this._sessions.filter(s => s.id !== id);
        if (this._activeSessionId === id) this._activeSessionId = null;
        this._pushSessionList();
        break;
      }
    }
  }

  private _openNewSession(): void {
    try {
      const id = `s_${Date.now()}`;
      const session: Session = { id, title: 'New Session', msgs: [], createdAt: Date.now() };
      // Don't add to _sessions or persist yet — wait until first message arrives via syncSession
      this._activeSessionId = id;
      this._view?.webview.postMessage({
        type: 'sessionList',
        payload: { sessions: this._sessions, activeId: this._activeSessionId },
      });
      PanelViewProvider.open(
        this._extensionUri, this._skillManager, this._agentManager,
        this._memoryManager, this._processManager, session,
        (s) => this.syncSession(s), this._outputChannel,
        (closedId) => {
          if (this._activeSessionId === closedId && !this._sessions.find(s => s.id === closedId)) {
            this._activeSessionId = this._sessions[0]?.id ?? null;
            this._persist();
          }
        }
      );
    } catch (err) {
      this._outputChannel?.appendLine(`[ERROR] _openNewSession: ${String(err)}`);
      vscode.window.showErrorMessage(`New session error: ${String(err)}`);
    }
  }

  public syncSession(session: Session): void {
    const idx = this._sessions.findIndex(s => s.id === session.id);
    if (idx >= 0) {
      this._sessions[idx] = session;
      this._pushSessionList();
    } else if ((session.msgs as unknown[]).length > 0) {
      // Only persist a new session once it has at least one message
      this._sessions.unshift(session);
      this._pushSessionList();
    } else {
      // Session still empty — just update active highlight without persisting
      this._view?.webview.postMessage({
        type: 'sessionList',
        payload: { sessions: this._sessions, activeId: this._activeSessionId },
      });
    }
  }

  private _persist(): void {
    void this._globalState.update(STATE_KEY, this._sessions.slice(0, 200));
    void this._globalState.update(STATE_KEY_ACTIVE, this._activeSessionId);
  }

  public restoreActivePanel(): void {
    if (!this._activeSessionId) return;
    const session = this._sessions.find(s => s.id === this._activeSessionId);
    if (!session) return;
    PanelViewProvider.open(
      this._extensionUri, this._skillManager, this._agentManager,
      this._memoryManager, this._processManager, session,
      (s) => this.syncSession(s), this._outputChannel
    );
  }

  private _pushSessionList(): void {
    this._persist();
    this._view?.webview.postMessage({
      type: 'sessionList',
      payload: { sessions: this._sessions, activeId: this._activeSessionId },
    });
  }

  public newConversation(): void {
    this._openNewSession();
  }

  public stopGeneration(): void {
    // No-op: process is managed by PanelViewProvider
  }

  public insertMention(text: string): void {
    // Forward to active panel if open
    vscode.commands.executeCommand('ikame-claude.insertMentionToPanel', text);
  }

  public setOutputChannel(channel: vscode.OutputChannel): void {
    this._outputChannel = channel;
  }

  dispose(): void {
    // nothing to clean up
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'sidebar.js')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Ikame Claude Code</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
