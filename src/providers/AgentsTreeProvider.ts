import * as vscode from 'vscode';
import { Agent } from '../types';
import { AgentManager } from '../managers/AgentManager';

export class AgentsTreeProvider implements vscode.TreeDataProvider<AgentTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<AgentTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly _agentManager: AgentManager) {
    this._agentManager.onDidChangeAgents(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(element: AgentTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<AgentTreeItem[]> {
    const agents = await this._agentManager.loadAgents();
    return agents.map(a => new AgentTreeItem(a));
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

class AgentTreeItem extends vscode.TreeItem {
  constructor(public readonly agent: Agent) {
    super(agent.name, vscode.TreeItemCollapsibleState.None);
    this.description = agent.description;
    this.tooltip = agent.description;
    this.iconPath = new vscode.ThemeIcon('robot');
    this.contextValue = 'agent';
    this.command = {
      command: 'ikame-claude.openAgentManager',
      title: 'Open Agent',
      arguments: [agent.name],
    };
  }
}
