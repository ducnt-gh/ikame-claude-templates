import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { McpServer } from '../McpServer';
import { SkillManager } from '../managers/SkillManager';
import { AgentManager } from '../managers/AgentManager';
import { MemoryManager } from '../managers/MemoryManager';
import { ClaudeProcessManager } from '../managers/ClaudeProcessManager';
import { WebviewMessage, ExtensionMessage } from '../types';
import { Session } from './ChatViewProvider';

// Tools that never need user permission — read-only or safe interaction tools
const AUTO_ALLOW_TOOLS = new Set([
  'Read', 'read_file', 'Glob', 'glob', 'Grep', 'grep',
  'WebFetch', 'web_fetch', 'WebSearch', 'web_search',
]);

export class PanelViewProvider {
  private static _tabCounter = 0;

  private readonly _panel: vscode.WebviewPanel;
  private _activeProcess?: cp.ChildProcess;
  private _streamBuffer = '';
  private _currentModel = 'claude-sonnet-4-6';
  private _currentMode  = 'default';
  private _currentEffort: 'low'|'medium'|'high'|'max' = 'medium';
  private _thinkingEnabled = false;
  private _tokenCount = 0;
  private _session: Session;
  private _outputLog?: vscode.OutputChannel;
  private _claudeSessionId?: string;
  private _pendingToolNames = new Map<string, string>(); // tool_use_id → tool name
  private _pendingToolInputs = new Map<string, Record<string, unknown>>(); // tool_use_id → tool input
  private _deniedPaths: string[] = []; // paths/dirs that need --add-dir on next resume
  private _waitingForPermission = false; // suppress extra messageDone from close handler
  private _msgBuffer: ExtensionMessage[] = []; // buffer all UI messages until result — suppress if denied
  private _deniedToolIds = new Set<string>(); // tool_use_ids that were denied — skip new card on resume
  private _deniedToolKeyToIds = new Map<string, string[]>(); // "toolName|filePath" → stack of original tool_use_ids
  private _autoCompacted = false; // prevent double auto-compact in same session
  private readonly _mcpServer = new McpServer();

  private constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _skillManager: SkillManager,
    private readonly _agentManager: AgentManager,
    private readonly _memoryManager: MemoryManager,
    private readonly _processManager: ClaudeProcessManager,
    session: Session,
    private readonly _onSyncSession: (s: Session) => void,
    private readonly _onDispose?: (sessionId: string) => void
  ) {
    this._session = session;
    this._claudeSessionId = session.claudeSessionId;
    PanelViewProvider._tabCounter += 1;
    const title = session.title === 'New Session' ? 'Claude Code' : session.title.slice(0, 30);

    this._panel = vscode.window.createWebviewPanel(
      'ikame-claude.panel',
      title,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(_extensionUri, 'dist', 'webview'),
          vscode.Uri.joinPath(_extensionUri, 'resources'),
        ],
      }
    );

    this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);
    this._panel.webview.onDidReceiveMessage(msg => this._handleMessage(msg));

    this._skillManager.onDidChangeSkills(skills => {
      this._postMessage({ type: 'skillList', payload: skills });
    });

    this._agentManager.onDidChangeAgents(agents => {
      this._postMessage({ type: 'agentList', payload: agents });
    });

    this._panel.onDidDispose(() => {
      this._activeProcess?.kill();
      this._activeProcess = undefined;
      this._mcpServer.stop();
      this._onDispose?.(this._session.id);
    });

    this._mcpServer.onQuestion(payload => {
      this._outputLog?.appendLine(`[mcp] AskUserQuestion id=${payload.toolUseId}`);
      this._postMessage({ type: 'askQuestion', payload });
    });
    void this._mcpServer.start().then(() => {
      this._outputLog?.appendLine(`[mcp] server started on port ${this._mcpServer.port}`);
    });
  }

  public setOutputChannel(ch: vscode.OutputChannel): void { this._outputLog = ch; }

  // ─── Static factory ───────────────────────────────────────────────────────

  /**
   * Opens a new independent panel tab each time.
   */
  public static open(
    extensionUri: vscode.Uri,
    skillManager: SkillManager,
    agentManager: AgentManager,
    memoryManager: MemoryManager,
    processManager: ClaudeProcessManager,
    session?: Session,
    onSyncSession?: (s: Session) => void,
    outputChannel?: vscode.OutputChannel,
    onDispose?: (sessionId: string) => void
  ): PanelViewProvider {
    const s = session ?? { id: `s_${Date.now()}`, title: 'New Session', msgs: [], createdAt: Date.now() };
    const cb = onSyncSession ?? (() => {});
    const p = new PanelViewProvider(extensionUri, skillManager, agentManager, memoryManager, processManager, s, cb, onDispose);
    if (outputChannel) p.setOutputChannel(outputChannel);
    return p;
  }

  // ─── Message handling ─────────────────────────────────────────────────────

  private async _handleMessage(message: WebviewMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
        await this._sendInitialData();
        break;

      case 'sendMessage':
        await this._handleSendMessage(message.payload as { text: string; model?: string; mode?: string });
        break;

      case 'getSkills':
        this._postMessage({ type: 'skillList', payload: this._skillManager.getAllSkills() });
        break;

      case 'getAgents':
        this._postMessage({ type: 'agentList', payload: this._agentManager.getAllAgents() });
        break;

      case 'getMemory': {
        const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        this._postMessage({ type: 'memoryList', payload: this._memoryManager.loadMemoryIndex(projectPath) });
        break;
      }

      case 'openSkillEditor':
        await this._skillManager.openSkillInEditor(message.payload as string);
        break;

      case 'openAgentEditor':
        await this._agentManager.openAgentInEditor(message.payload as string);
        break;

      case 'stopStreaming':
        // Kill and clear — next message will spawn a fresh process with --resume
        this._activeProcess?.kill();
        this._activeProcess = undefined;
        this._postMessage({ type: 'messageDone', payload: null });
        vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', false);
        break;

      case 'pickFile': {
        const hint = message.payload as string | undefined;
        if (hint && !hint.includes('*')) {
          // Called from drag-drop with a filename — find it in workspace
          const found = await vscode.workspace.findFiles(`**/${hint}`, '**/node_modules/**', 5);
          if (found.length === 1) {
            this._postMessage({ type: 'filePicked', payload: found[0].fsPath });
          } else if (found.length > 1) {
            // Multiple matches — let user pick
            const picks = found.map(f => vscode.workspace.asRelativePath(f));
            const chosen = await vscode.window.showQuickPick(picks, { placeHolder: `Multiple matches for "${hint}" — pick one` });
            if (chosen) {
              const chosenUri = found[picks.indexOf(chosen)];
              this._postMessage({ type: 'filePicked', payload: chosenUri.fsPath });
            }
          } else {
            // Not in workspace — can't resolve path from webview sandbox
            vscode.window.showWarningMessage(`"${hint}" không tìm thấy trong workspace. Hãy dùng nút đính kèm hoặc drag từ VS Code Explorer.`);
          }
        } else {
          const files = await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: 'Attach' });
          if (files?.length) {
            files.forEach(f => this._postMessage({ type: 'filePicked', payload: f.fsPath }));
          }
        }
        break;
      }

      case 'getWorkspaceFiles': {
        const query = (message.payload as string) ?? '';
        const workspaceFiles = await vscode.workspace.findFiles(`**/*${query}*`, '**/node_modules/**', 20);
        this._postMessage({
          type: 'workspaceFiles',
          payload: workspaceFiles.map(f => vscode.workspace.asRelativePath(f)),
        });
        break;
      }

      case 'setModel': {
        const modelId = message.payload as string;
        this._currentModel = modelId;
        const config = vscode.workspace.getConfiguration('ikameClaude');
        await config.update('model', modelId, vscode.ConfigurationTarget.Global);
        break;
      }

      case 'setMode':
        this._currentMode = message.payload as string;
        break;

      case 'setThinking':
        this._thinkingEnabled = message.payload as boolean;
        break;

      case 'setEffort':
        this._currentEffort = message.payload as 'low'|'medium'|'high'|'max';
        break;

      case 'permissionResponse': {
        const resp = message.payload as { id: string; action: string; tool?: string; filePath?: string };
        if (resp.action === 'alwaysAllow') {
          // Permanently switch to bypass for this session
          this._currentMode = 'bypassPermissions';
          this._postMessage({ type: 'configUpdate', payload: { mode: 'bypassPermissions' } });
          await this._spawnContinue('bypassPermissions');
        } else if (resp.action !== 'deny') {
          // One-time allow — resume with bypass but keep original mode
          await this._spawnContinue('bypassPermissions');
        } else {
          // User denied — end the turn cleanly
          this._waitingForPermission = false;
          this._postMessage({ type: 'messageDone', payload: null });
          vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', false);
        }
        break;
      }

      case 'compact':
        await this._handleCompact();
        break;

      case 'runCommand':
        await this._handleRunCommand(message.payload as string);
        break;

      case 'newConversation':
      case 'newSession':
        this._activeProcess?.kill();
        this._activeProcess = undefined;
        this._claudeSessionId = undefined;
        vscode.commands.executeCommand('ikame-claude.newConversation');
        break;

      case 'openFile': {
        const filePath = message.payload as string;
        const uri = vscode.Uri.file(filePath);
        await vscode.window.showTextDocument(uri, { preview: false });
        break;
      }

      case 'copyToClipboard':
        await vscode.env.clipboard.writeText(message.payload as string);
        break;

      case 'questionAnswer': {
        const { toolUseId, answers } = message.payload as { toolUseId: string; answers: Record<string, string> };
        this._outputLog?.appendLine(`[questionAnswer] toolUseId=${toolUseId} answers=${JSON.stringify(answers)}`);
        this._mcpServer.answerQuestion(toolUseId, answers);
        break;
      }

      case 'fileContent': {
        const { name, content, binary } = message.payload as { name: string; content: string; binary?: boolean };
        const tmpPath = path.join(os.tmpdir(), name);
        if (binary) {
          // data:image/png;base64,xxxx → strip header, decode base64
          const base64 = content.replace(/^data:[^;]+;base64,/, '');
          fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'));
        } else {
          fs.writeFileSync(tmpPath, content, 'utf8');
        }
        this._postMessage({ type: 'filePicked', payload: tmpPath });
        break;
      }



      case 'insertMention': {
        const mentionText = message.payload as string;
        this._postMessage({ type: 'mentionInserted', payload: mentionText });
        break;
      }

      case 'acceptDiff':
      case 'rejectDiff':
        break;

      case 'renameSession': {
        const { id, title } = message.payload as { id: string; title: string };
        if (id === this._session.id && title) {
          this._session = { ...this._session, title };
          this._onSyncSession(this._session);
          this._panel.title = title.slice(0, 30);
        }
        break;
      }

      case 'saveSession': {
        const updated = message.payload as Session;
        // Preserve fields webview doesn't know about
        const merged = {
          ...updated,
          claudeSessionId: this._claudeSessionId ?? updated.claudeSessionId,
          ctxPct:   this._session.ctxPct,
          ctxTotal: this._session.ctxTotal,
        };
        this._session = merged;
        this._onSyncSession(merged);
        if (merged.title && merged.title !== 'New Session') {
          this._panel.title = merged.title.slice(0, 30);
        }
        break;
      }
    }
  }

  private async _handleCompact(): Promise<void> {
    const execPath = await this._processManager.findExecutable();
    if (!execPath) {
      this._postMessage({ type: 'messageError', payload: 'Claude executable not found.' });
      return;
    }

    // Kill any active streaming first
    this._activeProcess?.kill();
    this._activeProcess = undefined;

    this._postMessage({ type: 'compactStart', payload: null });

    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
    this._outputLog?.appendLine(`[compact] sessionId=${this._claudeSessionId ?? 'none'} cwd=${cwd}`);
    const summarizePrompt =
      'Please provide a concise but complete summary of our entire conversation so far. ' +
      'Include: the main goals and tasks discussed, key decisions made, important findings or results, ' +
      'any code written or modified, and the current state of work. ' +
      'This summary will be used as context for continuing the conversation in a new session.';

    const args = [
      '--output-format', 'stream-json',
      '--verbose',
      '--model', this._currentModel,
      '--permission-mode', 'default',
      '--effort', 'low',
      '--print', summarizePrompt,
    ];

    if (this._claudeSessionId) {
      args.push('--resume', this._claudeSessionId);
    }

    let summaryText = '';
    let buffer = '';

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = this._processManager.spawnWithArgs(execPath, args, cwd);
        proc.stdin?.end();

        proc.stdout?.on('data', (data: Buffer) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const evt = JSON.parse(line) as Record<string, unknown>;
              if (evt['type'] === 'assistant') {
                const content = (evt['message'] as Record<string, unknown>)?.['content'] as Array<Record<string, unknown>> | undefined;
                if (Array.isArray(content)) {
                  for (const block of content) {
                    if (block['type'] === 'text') summaryText += block['text'] as string;
                  }
                }
              }
            } catch { /* not JSON */ }
          }
        });

        proc.stderr?.on('data', (data: Buffer) => {
          this._outputLog?.appendLine(`[compact stderr] ${data.toString().trim()}`);
        });

        proc.on('close', code => {
          if (code === 0 || summaryText) resolve();
          else reject(new Error(`Summarize process exited with code ${code}`));
        });

        proc.on('error', reject);
      });
    } catch (err) {
      this._postMessage({ type: 'messageError', payload: `Compact failed: ${String(err)}` });
      return;
    }

    if (!summaryText.trim()) {
      this._postMessage({ type: 'messageError', payload: 'Compact failed: could not generate summary.' });
      return;
    }

    // Reset session — next message will start fresh with summary injected as first user message
    this._claudeSessionId = undefined;
    this._session = { ...this._session, claudeSessionId: undefined, ctxPct: 0 };
    this._onSyncSession(this._session);
    this._tokenCount = 0;
    this._autoCompacted = false;
    this._postMessage({ type: 'contextTokens', payload: { used: 0, total: this._session.ctxTotal } });

    this._postMessage({ type: 'compactDone', payload: summaryText.trim() });
  }

  private async _handleRunCommand(cmdId: string): Promise<void> {
    switch (cmdId) {
      case 'memory': {
        const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        this._postMessage({ type: 'memoryList', payload: this._memoryManager.loadMemoryIndex(projectPath) });
        break;
      }
      case 'hooks':
        vscode.commands.executeCommand('workbench.action.openSettings', 'ikameClaude');
        break;
      case 'permissions':
        vscode.commands.executeCommand('workbench.action.openSettings', 'ikameClaude.mode');
        break;
      case 'mcp':
        vscode.window.showInformationMessage('MCP server management: use Claude Code CLI in terminal (`claude mcp`).');
        break;
      case 'plugins':
        vscode.window.showInformationMessage('Plugin management: use Claude Code CLI in terminal (`claude plugins`).');
        break;
      case 'remote-control': {
        const execPath = await this._processManager.findExecutable();
        if (!execPath) { vscode.window.showErrorMessage('Claude executable not found.'); break; }
        const terminal = vscode.window.createTerminal({ name: 'Claude Remote Control' });
        terminal.sendText(`"${execPath}" --remote-control`);
        terminal.show();
        break;
      }
      case 'usage':
        this._postMessage({ type: 'messageError', payload: `Token usage this session: ~${this._tokenCount.toLocaleString()} tokens` });
        break;
    }
  }

  private async _sendInitialData(): Promise<void> {
    const [skills, agents] = await Promise.all([
      this._skillManager.loadSkills(),
      this._agentManager.loadAgents(),
    ]);
    const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const memory = this._memoryManager.loadMemoryIndex(projectPath);

    const config = vscode.workspace.getConfiguration('ikameClaude');
    const configPayload = {
      model:              config.get<string>('model', 'claude-sonnet-4-6'),
      initialPermissionMode: config.get<string>('initialPermissionMode', 'default'),
      useCtrlEnterToSend: config.get<boolean>('useCtrlEnterToSend', false),
    };

    this._postMessage({ type: 'skillList', payload: skills });
    this._postMessage({ type: 'agentList', payload: agents });
    this._postMessage({ type: 'memoryList', payload: memory });
    this._postMessage({ type: 'configUpdate', payload: configPayload });
    this._postMessage({ type: 'authState', payload: 'authenticated' });
    // Load the session into the chat UI
    this._postMessage({ type: 'loadSession', payload: this._session });
    // Restore last known context % so the compact icon shows correctly after reload
    this._outputLog?.appendLine(`[ctx-restore] ctxPct=${this._session.ctxPct} ctxTotal=${this._session.ctxTotal}`);
    if (this._session.ctxPct !== undefined && this._session.ctxPct > 0) {
      if (this._session.ctxTotal && this._session.ctxTotal > 0) {
        const used = Math.round((this._session.ctxPct / 100) * this._session.ctxTotal);
        this._outputLog?.appendLine(`[ctx-restore] sending contextTokens used=${used} total=${this._session.ctxTotal}`);
        this._postMessage({ type: 'contextTokens', payload: { used, total: this._session.ctxTotal } });
      }
      this._outputLog?.appendLine(`[ctx-restore] sending contextUpdate pct=${this._session.ctxPct}`);
      this._postMessage({ type: 'contextUpdate', payload: this._session.ctxPct });
    }
  }

  private async _handleSendMessage(payload: { text: string; model?: string; mode?: string }): Promise<void> {
    const execPath = await this._processManager.findExecutable();
    if (!execPath) {
      this._postMessage({
        type: 'messageError',
        payload: 'Claude executable not found. Please install Claude Code CLI or set ikameClaude.claudeExecutablePath.',
      });
      return;
    }

    if (payload.model) this._currentModel = payload.model;
    if (payload.mode)  this._currentMode  = payload.mode;
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();

    const args = [
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--verbose',
      '--model', this._currentModel,
      '--effort', this._thinkingEnabled ? 'max' : this._currentEffort,
      '--disallowed-tools', 'AskUserQuestion',
      '--allowedTools', 'mcp__extension__AskUserQuestion',
      '--mcp-config', this._mcpServer.mcpConfigJson(),
    ];

    // Only pass --permission-mode when not default — default mode with --resume
    // causes CLI to skip permission_request events and report denials in result instead
    if (this._currentMode !== 'default') {
      args.splice(4, 0, '--permission-mode', this._currentMode);
    }

    if (this._claudeSessionId) {
      args.push('--resume', this._claudeSessionId);
    }

    // Always allow reading temp dir (for drag-dropped binary/image files)
    args.push('--add-dir', os.tmpdir());

    // Auto-add common dirs when mode allows broad access
    for (const dir of this._getAddDirArgs()) {
      args.push('--add-dir', dir);
    }

    this._activeProcess?.kill();

    try {
      const proc = this._processManager.spawnWithArgs(execPath, args, cwd);
      this._activeProcess = proc;
      this._streamBuffer = '';
      this._msgBuffer = [];
      this._deniedToolIds.clear();
      this._deniedToolKeyToIds.clear();
      this._pendingToolInputs.clear();
      this._autoCompacted = false;
      this._lastEventTime = 0;

      vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', true);

      // With --input-format stream-json, write the user message as JSON to stdin.
      // Keep stdin open so AskUserQuestion tool_results can be injected while Claude runs.
      const userMsg = {
        type: 'user',
        message: { role: 'user', content: payload.text },
      };
      proc.stdin?.write(JSON.stringify(userMsg) + '\n');

      proc.stdout?.on('data', (data: Buffer) => {
        this._streamBuffer += data.toString();
        const lines = this._streamBuffer.split('\n');
        this._streamBuffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            this._handleStreamEvent(parsed);
          } catch { /* not JSON */ }
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        if (text.trim()) this._outputLog?.appendLine(`[stderr] ${text.trim()}`);
      });

      proc.on('close', () => {
        // Ignore close events from superseded processes
        if (this._activeProcess !== proc && this._activeProcess !== undefined) return;
        this._outputLog?.appendLine(`[close/send] waiting=${this._waitingForPermission} buf="${this._streamBuffer.slice(0,80)}"`);
        if (this._streamBuffer.trim()) {
          try {
            const parsed = JSON.parse(this._streamBuffer.trim());
            this._handleStreamEvent(parsed);
          } catch { /* not JSON */ }
          this._streamBuffer = '';
        }
        this._activeProcess = undefined;
        this._outputLog?.appendLine(`[close/send] after handleStreamEvent waiting=${this._waitingForPermission}`);
        if (!this._waitingForPermission) {
          this._postMessage({ type: 'messageDone', payload: null });
          vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', false);
        }
      });
    } catch (err) {
      this._postMessage({ type: 'messageError', payload: String(err) });
      vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', false);
    }
  }

  private async _spawnContinue(modeOverride?: string): Promise<void> {
    const execPath = await this._processManager.findExecutable();
    if (!execPath) return;
    const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();

    const args = [
      '--output-format', 'stream-json',
      '--input-format', 'stream-json',
      '--verbose',
      '--model', this._currentModel,
      '--permission-mode', modeOverride ?? this._currentMode,
      '--effort', this._thinkingEnabled ? 'max' : this._currentEffort,
      '--disallowed-tools', 'AskUserQuestion',
      '--allowedTools', 'mcp__extension__AskUserQuestion',
      '--mcp-config', this._mcpServer.mcpConfigJson(),
    ];

    if (this._claudeSessionId) {
      args.push('--resume', this._claudeSessionId);
    } else {
      args.push('--continue');
    }

    // Grant access: denied paths from last turn + broad dirs for permissive modes
    const addDirs = [os.tmpdir(), ...this._deniedPaths, ...this._getAddDirArgs()];
    for (const dir of [...new Set(addDirs)]) {
      args.push('--add-dir', dir);
    }
    this._deniedPaths = [];
    this._outputLog?.appendLine(`[spawnContinue] args=${JSON.stringify(args)}`);

    try {
      const proc = this._processManager.spawnWithArgs(execPath, args, cwd);
      this._activeProcess = proc;
      this._waitingForPermission = false; // clear only after new process is assigned
      this._streamBuffer = '';
      this._msgBuffer = [];
      this._lastEventTime = 0;
      vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', true);
      this._postMessage({ type: 'streamResumed', payload: null });
      // Write continue prompt via stream-json then close stdin
      const continueMsg = {
        type: 'user',
        message: { role: 'user', content: 'Please continue with the task.' },
      };
      proc.stdin?.write(JSON.stringify(continueMsg) + '\n');
      proc.stdin?.end();

      proc.stdout?.on('data', (data: Buffer) => {
        this._streamBuffer += data.toString();
        const lines = this._streamBuffer.split('\n');
        this._streamBuffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try { this._handleStreamEvent(JSON.parse(line)); } catch { /* not JSON */ }
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const text = data.toString();
        if (text.trim()) this._outputLog?.appendLine(`[stderr] ${text.trim()}`);
      });

      proc.on('close', () => {
        if (this._activeProcess !== proc && this._activeProcess !== undefined) return;
        if (this._streamBuffer.trim()) {
          try { this._handleStreamEvent(JSON.parse(this._streamBuffer.trim())); } catch { /* not JSON */ }
          this._streamBuffer = '';
        }
        this._activeProcess = undefined;
        this._outputLog?.appendLine(`[close/send] waiting=${this._waitingForPermission} buf="${this._streamBuffer.slice(0, 50)}"`);
        if (!this._waitingForPermission) {
          this._postMessage({ type: 'messageDone', payload: null });
          vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', false);
        }
        this._outputLog?.appendLine(`[close/send] after handleStreamEvent waiting=${this._waitingForPermission}`);
      });
    } catch (err) {
      this._postMessage({ type: 'messageError', payload: String(err) });
      vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', false);
    }
  }

  private _lastEventTime = 0;

  private _handleStreamEvent(event: Record<string, unknown>): void {
    const type = event['type'];
    const now = Date.now();
    const delta = this._lastEventTime ? `+${now - this._lastEventTime}ms` : 'start';
    this._lastEventTime = now;
    this._outputLog?.appendLine(`[stream] ${new Date(now).toISOString().slice(11,23)} (${delta}) type=${String(type)}`);

    if (type === 'assistant') {
      const message = event['message'] as Record<string, unknown> | undefined;
      const content = message?.['content'] as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block['type'] === 'text') {
            this._msgBuffer.push({ type: 'messageChunk', payload: block['text'] as string });
          } else if (block['type'] === 'thinking') {
            this._postMessage({ type: 'thinkingUpdate', payload: block['thinking'] });
          } else if (block['type'] === 'tool_use') {
            const toolId = block['id'] as string;
            const toolName = block['name'] as string;
            const toolInput = block['input'] as Record<string, unknown> | undefined;
            this._outputLog?.appendLine(`[tool_use] id=${toolId} name=${toolName} inputKeys=${toolInput ? Object.keys(toolInput).join(',') : 'none'}`);

            this._pendingToolNames.set(toolId, toolName);
            if (toolInput) this._pendingToolInputs.set(toolId, toolInput);

            const diff = toolInput ? this._computeDiff(toolName, toolInput) : undefined;
            this._outputLog?.appendLine(`[tool_use] diff=${diff ? diff.split('\n').length + ' lines' : 'none'}`);

            // Check if this is a retry of a previously denied tool — reuse the original card
            const retryKey = `${toolName}|${((toolInput?.['file_path'] ?? toolInput?.['command'] ?? '') as string).replace(/\\/g, '/')}`;
            const idStack = this._deniedToolKeyToIds.get(retryKey);
            const originalId = idStack?.shift(); // pop oldest denied id for this key
            if (idStack?.length === 0) this._deniedToolKeyToIds.delete(retryKey);
            this._outputLog?.appendLine(`[retry] key="${retryKey}" originalId=${originalId ?? 'none'} mapSize=${this._deniedToolKeyToIds.size}`);
            if (originalId) {
              this._pendingToolNames.set(originalId, toolName);
              // Update existing card: denied → running (pulse)
              this._postMessage({
                type: 'toolUse',
                payload: { id: originalId, name: toolName, input: toolInput, running: 'waiting', diff },
              });
              // Remap future tool_result for new id → original id
              this._pendingToolNames.set(toolId, `__remap__${originalId}`);
            } else {
              this._postMessage({
                type: 'toolUse',
                payload: { id: toolId, name: toolName, input: toolInput, running: true, diff },
              });
            }
          }
        }
      }
    }

    // Claude CLI stream-json: tool results come in 'user' turn content blocks
    if (type === 'user') {
      const message = event['message'] as Record<string, unknown> | undefined;
      const content = message?.['content'] as Array<Record<string, unknown>> | undefined;
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block['type'] === 'tool_result') {
            const rawContent = block['content'];
            let resultText: string;
            if (Array.isArray(rawContent)) {
              resultText = (rawContent as Array<Record<string,unknown>>)
                .map(c => (c['type'] === 'text' ? String(c['text'] ?? '') : JSON.stringify(c)))
                .join('\n');
            } else {
              resultText = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
            }


            const rawId = (block['tool_use_id'] as string) ?? '';
            const isError = block['is_error'] === true;
            // Resolve remap: if this tool was a retry, use the original card id
            const remapVal = this._pendingToolNames.get(rawId);
            const resolvedId = remapVal?.startsWith('__remap__') ? remapVal.slice(9) : rawId;

            // Early denial detection: if tool errored and needs permission, show dialog immediately
            // without waiting for the result event at end of turn.
            if (isError && this._currentMode !== 'bypassPermissions' && !this._waitingForPermission) {
              const toolName = this._pendingToolNames.get(rawId) ?? '';
              const isPermDenial = !AUTO_ALLOW_TOOLS.has(toolName) && toolName !== '' &&
                (resultText.toLowerCase().includes('permission') || resultText.toLowerCase().includes('denied') || resultText.toLowerCase().includes('not allowed'));
              if (isPermDenial) {
                const toolInput = this._pendingToolInputs.get(rawId);
                const filePath = toolInput?.['file_path'] as string | undefined;
                const command = toolInput?.['command'] as string | undefined;
                const displayPath = toolName === 'Bash' || toolName === 'PowerShell' ? command : filePath;

                this._waitingForPermission = true;
                this._msgBuffer = [];
                this._postMessage({ type: 'permissionPending', payload: null });
                vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', false);

                const toolKey = `${toolName}|${(displayPath ?? '').replace(/\\/g, '/')}`;
                const existing = this._deniedToolKeyToIds.get(toolKey) ?? [];
                existing.push(resolvedId);
                this._deniedToolKeyToIds.set(toolKey, existing);
                this._deniedToolIds.add(resolvedId);

                if (filePath) {
                  const parent = filePath.replace(/[\\/][^\\/]+$/, '') || filePath;
                  if (!this._deniedPaths.includes(parent)) this._deniedPaths.push(parent);
                }

                // Mark card denied then show dialog
                this._postMessage({ type: 'toolUse', payload: { id: resolvedId, name: toolName, running: 'denied' } });
                this._postMessage({ type: 'permissionRequest', payload: { items: [{ id: resolvedId, tool: toolName, path: displayPath }] } });
                continue;
              }
            }

            // Flush tool results immediately so they appear as each tool completes.
            // Only text chunks stay buffered (they may be discarded on denial).
            this._postMessage({
              type: 'toolUse',
              payload: { id: resolvedId, name: '', result: resultText, running: false, isError },
            });
          }
        }
      }
    }

    // Fallback: top-level tool_result (some versions)
    if (type === 'tool_result') {
      this._postMessage({
        type: 'toolUse',
        payload: {
          id: (event['tool_use_id'] as string) ?? '',
          name: '',
          result: JSON.stringify(event['content']),
          running: false,
        },
      });
    }

    if (type === 'system') {
      const subtype = event['subtype'] as string | undefined;
      if (subtype === 'init') {
        const cliId = event['session_id'] as string | undefined;
        if (cliId && cliId !== this._claudeSessionId) {
          this._claudeSessionId = cliId;
          this._session = { ...this._session, claudeSessionId: cliId };
          this._onSyncSession(this._session);
        }
      }

    }

    if (type === 'permission_request' && this._currentMode !== 'bypassPermissions') {
      this._waitingForPermission = true;
      this._postMessage({ type: 'permissionPending', payload: null });
      vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', false);
      this._postMessage({
        type: 'permissionRequest',
        payload: {
          id:          (event['id'] as string) ?? '',
          tool:        (event['tool_name'] as string) ?? '',
          description: (event['description'] as string) ?? '',
          path:        (event['path'] as string) ?? undefined,
        },
      });
    }

    if (type === 'result') {
      // modelUsage uses camelCase; usage uses snake_case.
      // Total context used = all input tokens (new + cached) + output tokens.
      const usage = event['usage'] as Record<string, unknown> | undefined;
      if (usage) {
        const input        = (usage['input_tokens']                 as number) ?? 0;
        const output       = (usage['output_tokens']                as number) ?? 0;
        const cacheRead    = (usage['cache_read_input_tokens']      as number) ?? 0;
        const cacheCreate  = (usage['cache_creation_input_tokens']  as number) ?? 0;
        this._tokenCount = input + output + cacheRead + cacheCreate;
      }
      const modelUsage = event['modelUsage'] as Record<string, Record<string, unknown>> | undefined;
      if (modelUsage) {
        const firstModel = Object.values(modelUsage)[0];
        const ctxWindow = (firstModel?.['contextWindow'] as number) ?? 0;
        if (ctxWindow > 0) {
          const pct = Math.min(100, Math.round((this._tokenCount / ctxWindow) * 100));
          this._postMessage({ type: 'contextTokens', payload: { used: this._tokenCount, total: ctxWindow } });
          this._postMessage({ type: 'contextUpdate', payload: pct });
          this._session = { ...this._session, ctxPct: pct, ctxTotal: ctxWindow };
          this._onSyncSession(this._session);
          // Auto-compact when context exceeds 80% to prevent model confusion
          if (pct >= 80 && !this._autoCompacted) {
            this._autoCompacted = true;
            this._outputLog?.appendLine(`[auto-compact] ctx=${pct}% >= 80%, triggering compact`);
            setTimeout(() => { void this._handleCompact(); }, 100);
          }
        }
      }

      const denials = (event['permission_denials'] as Array<Record<string, unknown>> | undefined) ?? [];
      this._outputLog?.appendLine(`[perm] denials.length=${denials.length} waitingForPerm=${this._waitingForPermission} sessionId=${this._claudeSessionId}`);

      // If denial was already detected early (from tool_result is_error), skip — dialog already shown.
      if (denials.length > 0 && this._currentMode !== 'bypassPermissions' && !this._waitingForPermission) {
        const realDenials = denials.filter(d => !AUTO_ALLOW_TOOLS.has((d['tool_name'] as string) ?? ''));

        // If only auto-allowed tools were denied, auto-continue
        if (realDenials.length === 0) {
          for (const msg of this._msgBuffer) this._postMessage(msg);
          this._msgBuffer = [];
          this._waitingForPermission = true;
          vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', false);
          setTimeout(() => { void this._spawnContinue('bypassPermissions'); }, 50);
          return;
        }

        // Tool results are already flushed immediately; only discard buffered text chunks.
        this._msgBuffer = [];
        // Mark that the close handler should NOT emit messageDone — permission dialog handles it
        this._waitingForPermission = true;
        this._postMessage({ type: 'permissionPending', payload: null });
        vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', false);
        this._deniedPaths = [];

        const permItems: Array<{ id: string; tool: string; path?: string }> = [];
        for (const denial of realDenials) {
          const toolName = (denial['tool_name'] as string) ?? '';
          const toolInput = denial['tool_input'] as Record<string, unknown> | undefined;
          const filePath = toolInput?.['file_path'] as string | undefined;
          const command = toolInput?.['command'] as string | undefined;
          const toolUseId = (denial['tool_use_id'] as string) ?? `perm_${Date.now()}`;
          const displayPath = toolName === 'Bash' || toolName === 'PowerShell' ? command : filePath;

          this._deniedToolIds.add(toolUseId);

          // Map tool key → stack of original ids (multiple denials with same key e.g. 3 Write to same file)
          const toolKey = `${toolName}|${(displayPath ?? '').replace(/\\/g, '/')}`;
          const existing = this._deniedToolKeyToIds.get(toolKey) ?? [];
          existing.push(toolUseId);
          this._deniedToolKeyToIds.set(toolKey, existing);

          // Track the parent directory of denied paths so _spawnContinue can add --add-dir
          if (filePath) {
            const parent = filePath.replace(/[\\/][^\\/]+$/, '') || filePath;
            if (!this._deniedPaths.includes(parent)) this._deniedPaths.push(parent);
          }

          // Mark card as Denied immediately
          this._postMessage({
            type: 'toolUse',
            payload: { id: toolUseId, name: toolName, running: 'denied' },
          });

          permItems.push({ id: toolUseId, tool: toolName, path: displayPath });
        }

        // Send a single batched permission request for all denials
        this._postMessage({
          type: 'permissionRequest',
          payload: { items: permItems },
        });
      } else {
        // No denials (or bypass mode) — flush all buffered messages to UI now
        for (const msg of this._msgBuffer) {
          this._postMessage(msg);
        }
        this._msgBuffer = [];

        // In bypass mode with denials, auto-continue so Claude retries without asking
        if (denials.length > 0 && this._currentMode === 'bypassPermissions') {
          this._waitingForPermission = true;
          vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', false);
          this._deniedPaths = [];
          for (const denial of denials) {
            const filePath = (denial['tool_input'] as Record<string, unknown> | undefined)?.['file_path'] as string | undefined;
            if (filePath) {
              const parent = filePath.replace(/[\\/][^\\/]+$/, '') || filePath;
              if (!this._deniedPaths.includes(parent)) this._deniedPaths.push(parent);
            }
          }
          // Delay slightly so close event fires first before we re-spawn
          setTimeout(() => { void this._spawnContinue(); }, 50);
        }
      }
    }
  }

  // ─── HTML / helpers ───────────────────────────────────────────────────────

  private _computeDiff(toolName: string, toolInput: Record<string, unknown>): string | undefined {
    try {
      const filePath = (toolInput['file_path'] ?? toolInput['path']) as string | undefined;
      if (!filePath) return undefined;

      let oldText = '';
      let newText = '';

      if (toolName === 'Write' || toolName === 'write_file') {
        oldText = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
        newText = (toolInput['content'] as string) ?? '';
      } else if (toolName === 'Edit' || toolName === 'edit_file') {
        oldText = (toolInput['old_string'] as string ?? toolInput['old_str'] as string) ?? '';
        newText = (toolInput['new_string'] as string ?? toolInput['new_str'] as string) ?? '';
      } else {
        return undefined;
      }

      if (oldText === newText) return undefined;

      const oldLines = oldText.split('\n');
      const newLines = newText.split('\n');
      const diff: string[] = [];

      // Simple LCS-based line diff
      const m = oldLines.length, n = newLines.length;
      const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
      for (let i = m - 1; i >= 0; i--)
        for (let j = n - 1; j >= 0; j--)
          dp[i][j] = oldLines[i] === newLines[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);

      let i = 0, j = 0;
      while (i < m || j < n) {
        if (i < m && j < n && oldLines[i] === newLines[j]) {
          diff.push(' ' + oldLines[i]); i++; j++;
        } else if (j < n && (i >= m || dp[i+1][j] >= dp[i][j+1])) {
          diff.push('+' + newLines[j]); j++;
        } else {
          diff.push('-' + oldLines[i]); i++;
        }
      }

      return diff.join('\n');
    } catch {
      return undefined;
    }
  }

  private _getAddDirArgs(): string[] {
    const mode = this._currentMode;
    if (mode !== 'bypassPermissions' && mode !== 'acceptEdits') return [];
    const dirs: string[] = [os.homedir()];
    const ws = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (ws && !ws.startsWith(os.homedir())) dirs.push(ws);
    return dirs;
  }

  private _postMessage(message: ExtensionMessage): void {
    // Always send — reveal panel if needed for permission requests
    if (!this._panel.visible && message.type === 'permissionRequest') {
      this._panel.reveal(vscode.ViewColumn.Active, false);
    }
    this._panel.webview.postMessage(message);
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'dist', 'webview', 'index.js')
    );
    const nonce = getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Claude Code</title>
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
