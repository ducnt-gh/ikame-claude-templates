import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Agent } from '../types';

export class AgentManager {
  private _agents: Map<string, Agent> = new Map();
  private _watcher: vscode.FileSystemWatcher | null = null;
  private _onDidChangeAgents = new vscode.EventEmitter<Agent[]>();
  readonly onDidChangeAgents = this._onDidChangeAgents.event;

  async loadAgents(): Promise<Agent[]> {
    this._agents.clear();
    const agentDirs = this.getAgentDirectories();

    for (const dir of agentDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        for (const file of files) {
          const filePath = path.join(dir, file);
          const agent = this.parseAgentFile(filePath);
          if (agent) {
            this._agents.set(agent.name, agent);
          }
        }
      } catch {
        // ignore
      }
    }

    this.setupWatcher();
    return Array.from(this._agents.values());
  }

  private getAgentDirectories(): string[] {
    const home = os.homedir();
    const dirs = [path.join(home, '.claude', 'agents')];

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        dirs.push(path.join(folder.uri.fsPath, '.claude', 'agents'));
      }
    }

    return dirs;
  }

  private parseAgentFile(filePath: string): Agent | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const fileName = path.basename(filePath, '.md');

      const descriptionMatch = content.match(/description:\s*(.+)/);
      const description = descriptionMatch
        ? descriptionMatch[1].trim()
        : `Agent: ${fileName}`;

      const toolsMatch = content.match(/tools:\s*\[([^\]]+)\]/);
      const tools = toolsMatch
        ? toolsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''))
        : undefined;

      return { name: fileName, description, filePath, content, tools };
    } catch {
      return null;
    }
  }

  getAllAgents(): Agent[] {
    return Array.from(this._agents.values());
  }

  getAgent(name: string): Agent | undefined {
    return this._agents.get(name);
  }

  async openAgentInEditor(agentName: string): Promise<void> {
    const agent = this._agents.get(agentName);
    if (!agent) {
      vscode.window.showErrorMessage(`Agent "${agentName}" not found`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument(agent.filePath);
    await vscode.window.showTextDocument(doc);
  }

  async createAgent(name: string, content: string): Promise<Agent> {
    const home = os.homedir();
    const agentsDir = path.join(home, '.claude', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });

    const filePath = path.join(agentsDir, `${name}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');

    const agent = this.parseAgentFile(filePath);
    if (!agent) throw new Error('Failed to parse created agent');

    this._agents.set(agent.name, agent);
    this._onDidChangeAgents.fire(this.getAllAgents());
    return agent;
  }

  private setupWatcher(): void {
    this._watcher?.dispose();

    const pattern = new vscode.RelativePattern(os.homedir(), '.claude/agents/*.md');
    this._watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const reload = async () => {
      await this.loadAgents();
      this._onDidChangeAgents.fire(this.getAllAgents());
    };

    this._watcher.onDidCreate(reload);
    this._watcher.onDidChange(reload);
    this._watcher.onDidDelete(reload);
  }

  dispose(): void {
    this._watcher?.dispose();
    this._onDidChangeAgents.dispose();
  }
}
