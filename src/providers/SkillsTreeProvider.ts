import * as vscode from 'vscode';
import { Skill } from '../types';
import { SkillManager } from '../managers/SkillManager';

export class SkillsTreeProvider implements vscode.TreeDataProvider<SkillTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SkillTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private readonly _skillManager: SkillManager) {
    this._skillManager.onDidChangeSkills(() => this._onDidChangeTreeData.fire());
  }

  getTreeItem(element: SkillTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(): Promise<SkillTreeItem[]> {
    const skills = await this._skillManager.loadSkills();
    return skills.map(s => new SkillTreeItem(s));
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }
}

class SkillTreeItem extends vscode.TreeItem {
  constructor(public readonly skill: Skill) {
    super(skill.name, vscode.TreeItemCollapsibleState.None);
    this.description = skill.description;
    this.tooltip = `${skill.name}: ${skill.description}`;
    this.iconPath = new vscode.ThemeIcon(skill.isBuiltIn ? 'symbol-function' : 'file-code');
    this.contextValue = 'skill';
    this.command = {
      command: 'ikame-claude.openSkillEditor',
      title: 'Open Skill',
      arguments: [skill.name],
    };
  }
}
