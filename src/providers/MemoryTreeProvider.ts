import * as vscode from 'vscode';
import { MemoryEntry } from '../types';
import { MemoryManager } from '../managers/MemoryManager';

export class MemoryTreeProvider implements vscode.TreeDataProvider<MemoryTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<MemoryTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly _memoryManager: MemoryManager) {
    this._memoryManager.onDidChangeMemory(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(element: MemoryTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: MemoryTreeItem): vscode.ProviderResult<MemoryTreeItem[]> {
    if (element) return [];

    const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const index = this._memoryManager.loadMemoryIndex(projectPath);

    const typeOrder: MemoryEntry['type'][] = ['user', 'feedback', 'project', 'reference'];
    const sorted = [...index.entries].sort(
      (a, b) => typeOrder.indexOf(a.type) - typeOrder.indexOf(b.type)
    );

    return sorted.map(e => new MemoryTreeItem(e));
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

const typeIcons: Record<MemoryEntry['type'], string> = {
  user: 'person',
  feedback: 'feedback',
  project: 'project',
  reference: 'references',
};

class MemoryTreeItem extends vscode.TreeItem {
  constructor(public readonly entry: MemoryEntry) {
    super(entry.name, vscode.TreeItemCollapsibleState.None);
    this.description = `[${entry.type}] ${entry.description}`;
    this.tooltip = entry.description;
    this.iconPath = new vscode.ThemeIcon(typeIcons[entry.type] ?? 'database');
    this.contextValue = 'memoryEntry';
    this.command = {
      command: 'vscode.open',
      title: 'Open Memory File',
      arguments: [vscode.Uri.file(entry.filePath)],
    };
  }
}
