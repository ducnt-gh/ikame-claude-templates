import * as vscode from 'vscode';
import { ChatViewProvider } from './providers/ChatViewProvider';
import { PanelViewProvider } from './providers/PanelViewProvider';
import { SkillsTreeProvider } from './providers/SkillsTreeProvider';
import { AgentsTreeProvider } from './providers/AgentsTreeProvider';
import { MemoryTreeProvider } from './providers/MemoryTreeProvider';
import { SkillManager } from './managers/SkillManager';
import { AgentManager } from './managers/AgentManager';
import { MemoryManager } from './managers/MemoryManager';
import { ClaudeProcessManager } from './managers/ClaudeProcessManager';

export function activate(context: vscode.ExtensionContext): void {
  // ── Output channel ────────────────────────────────────────────────────────
  const outputChannel = vscode.window.createOutputChannel('Ikame Claude Code');
  context.subscriptions.push(outputChannel);

  // ── Status bar item (shows current mode) ─────────────────────────────────
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.text = '$(comment-discussion) Claude';
  statusBarItem.tooltip = 'Ikame Claude Code';
  statusBarItem.command = 'ikame-claude.openPanel';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // ── Managers ──────────────────────────────────────────────────────────────
  const skillManager = new SkillManager();
  const agentManager = new AgentManager();
  const memoryManager = new MemoryManager();
  const processManager = new ClaudeProcessManager();

  // ── Providers ─────────────────────────────────────────────────────────────
  const chatProvider = new ChatViewProvider(
    context.extensionUri,
    skillManager,
    agentManager,
    memoryManager,
    processManager,
    context.globalState
  );
  chatProvider.setOutputChannel(outputChannel);

  const skillsTreeProvider = new SkillsTreeProvider(skillManager);
  const agentsTreeProvider = new AgentsTreeProvider(agentManager);
  const memoryTreeProvider = new MemoryTreeProvider(memoryManager);

  // ── Set initial context keys ──────────────────────────────────────────────
  vscode.commands.executeCommand('setContext', 'ikame-claude.chatFocused', false);
  vscode.commands.executeCommand('setContext', 'ikame-claude.streaming', false);

  // ── Register webview / tree providers ────────────────────────────────────
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ChatViewProvider.viewId, chatProvider),
    vscode.window.registerTreeDataProvider('ikame-claude.skillsView', skillsTreeProvider),
    vscode.window.registerTreeDataProvider('ikame-claude.agentsView', agentsTreeProvider),
    vscode.window.registerTreeDataProvider('ikame-claude.memoryView', memoryTreeProvider)
  );

  // ── Commands ──────────────────────────────────────────────────────────────
  context.subscriptions.push(
    // Open activity bar panel (existing behaviour)
    vscode.commands.registerCommand('ikame-claude.openPanel', () => {
      vscode.commands.executeCommand('workbench.view.extension.ikame-claude');
    }),

    // Open sidebar chat view
    vscode.commands.registerCommand('ikame-claude.openSidebar', () => {
      vscode.commands.executeCommand('ikame-claude.chatView.focus');
    }),

    // Open as an editor tab (new)
    vscode.commands.registerCommand('ikame-claude.openNewTab', () => {
      PanelViewProvider.open(
        context.extensionUri,
        skillManager,
        agentManager,
        memoryManager,
        processManager
      );
    }),

    // New conversation
    vscode.commands.registerCommand('ikame-claude.newConversation', () => {
      chatProvider.newConversation();
    }),

    // Focus the sidebar input
    vscode.commands.registerCommand('ikame-claude.focusInput', () => {
      vscode.commands.executeCommand('ikame-claude.chatView.focus');
    }),

    // Insert @mention from the active editor selection
    vscode.commands.registerCommand('ikame-claude.insertAtMention', () => {
      const editor = vscode.window.activeTextEditor;
      const selection = editor?.selection;
      const selectedText = editor && selection && !selection.isEmpty
        ? editor.document.getText(selection)
        : editor?.document.fileName ?? '';
      const mentionText = selectedText
        ? `@${selectedText}`
        : `@${vscode.workspace.asRelativePath(editor?.document.uri ?? vscode.Uri.file(''))}`;
      chatProvider.insertMention(mentionText);
      // Bring the chat view into focus so the user sees the insertion
      vscode.commands.executeCommand('ikame-claude.chatView.focus');
    }),

    // Show the output log channel
    vscode.commands.registerCommand('ikame-claude.showLogs', () => {
      outputChannel.show(true /* preserve focus */);
    }),

    // Stop any in-progress generation
    vscode.commands.registerCommand('ikame-claude.stopGeneration', () => {
      chatProvider.stopGeneration();
    }),

    // Memory manager
    vscode.commands.registerCommand('ikame-claude.openMemoryManager', async () => {
      const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      const memDir = memoryManager.getMemoryDir(projectPath);
      const uri = vscode.Uri.file(memDir);
      await vscode.commands.executeCommand('revealInExplorer', uri);
    }),

    // Agent manager
    vscode.commands.registerCommand('ikame-claude.openAgentManager', async (agentName?: string) => {
      if (agentName) {
        await agentManager.openAgentInEditor(agentName);
      } else {
        vscode.commands.executeCommand('ikame-claude.agentsView.focus');
      }
    }),

    // Skill editor
    vscode.commands.registerCommand('ikame-claude.openSkillEditor', async (skillName?: string) => {
      if (skillName) {
        await skillManager.openSkillInEditor(skillName);
      } else {
        const skills = skillManager.getAllSkills();
        const items = skills.map(s => ({
          label: `/${s.name}`,
          description: s.description,
          skill: s,
        }));
        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Select a skill to edit',
        });
        if (picked) {
          await skillManager.openSkillInEditor(picked.skill.name);
        }
      }
    })
  );

  // ── Restore active panel on startup ──────────────────────────────────────
  // chatProvider._restoreActivePanel() only fires when sidebar 'ready' event
  // comes in — which may never happen if user doesn't open the sidebar.
  // Restore the panel directly from extension.ts after a short delay.
  setTimeout(() => {
    chatProvider.restoreActivePanel();
  }, 500);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  context.subscriptions.push(
    { dispose: () => skillManager.dispose() },
    { dispose: () => agentManager.dispose() },
    { dispose: () => memoryManager.dispose() },
    { dispose: () => chatProvider.dispose() }
  );

  checkClaudeExecutable(processManager);
}

async function checkClaudeExecutable(processManager: ClaudeProcessManager): Promise<void> {
  const execPath = await processManager.findExecutable();
  if (!execPath) {
    const action = await vscode.window.showWarningMessage(
      'Ikame Claude Code: Claude executable not found. Install Claude Code CLI or set the path in settings.',
      'Open Settings',
      'Install Guide'
    );
    if (action === 'Open Settings') {
      vscode.commands.executeCommand(
        'workbench.action.openSettings',
        'ikameClaude.claudeExecutablePath'
      );
    }
  }
}

export function deactivate(): void {
  // cleanup handled via context.subscriptions
}
