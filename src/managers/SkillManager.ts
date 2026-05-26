import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Skill } from '../types';

export class SkillManager {
  private _skills: Map<string, Skill> = new Map();
  private _watcher: vscode.FileSystemWatcher | null = null;
  private _onDidChangeSkills = new vscode.EventEmitter<Skill[]>();
  readonly onDidChangeSkills = this._onDidChangeSkills.event;

  async loadSkills(): Promise<Skill[]> {
    this._skills.clear();
    const skillDirs = this.getSkillDirectories();

    for (const { dir, isBuiltIn } of skillDirs) {
      if (!fs.existsSync(dir)) continue;
      try {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.md'));
        for (const file of files) {
          const filePath = path.join(dir, file);
          const skill = this.parseSkillFile(filePath, isBuiltIn);
          if (skill) {
            this._skills.set(skill.name, skill);
          }
        }
      } catch {
        // ignore unreadable dirs
      }
    }

    this.setupWatcher();
    return Array.from(this._skills.values());
  }

  private getSkillDirectories(): { dir: string; isBuiltIn: boolean }[] {
    const config = vscode.workspace.getConfiguration('ikameClaude');
    const customDir = config.get<string>('skillsDirectory');
    const home = os.homedir();
    const dirs: { dir: string; isBuiltIn: boolean }[] = [];

    if (customDir) {
      dirs.push({ dir: customDir, isBuiltIn: false });
    }

    dirs.push({ dir: path.join(home, '.claude', 'skills'), isBuiltIn: true });

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
      for (const folder of workspaceFolders) {
        dirs.push({
          dir: path.join(folder.uri.fsPath, '.claude', 'skills'),
          isBuiltIn: false,
        });
      }
    }

    return dirs;
  }

  private parseSkillFile(filePath: string, isBuiltIn: boolean): Skill | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const fileName = path.basename(filePath, '.md');

      const descriptionMatch = content.match(/^#\s+(.+)$/m);
      const description = descriptionMatch
        ? descriptionMatch[1].trim()
        : `Skill: ${fileName}`;

      return {
        name: fileName,
        description,
        filePath,
        content,
        isBuiltIn,
      };
    } catch {
      return null;
    }
  }

  getSkill(name: string): Skill | undefined {
    return this._skills.get(name);
  }

  getAllSkills(): Skill[] {
    return Array.from(this._skills.values());
  }

  async createSkill(name: string, content: string): Promise<Skill> {
    const home = os.homedir();
    const skillsDir = path.join(home, '.claude', 'skills');
    fs.mkdirSync(skillsDir, { recursive: true });

    const filePath = path.join(skillsDir, `${name}.md`);
    fs.writeFileSync(filePath, content, 'utf-8');

    const skill = this.parseSkillFile(filePath, false);
    if (!skill) throw new Error('Failed to parse created skill');

    this._skills.set(skill.name, skill);
    this._onDidChangeSkills.fire(this.getAllSkills());
    return skill;
  }

  async openSkillInEditor(skillName: string): Promise<void> {
    const skill = this._skills.get(skillName);
    if (!skill) {
      vscode.window.showErrorMessage(`Skill "${skillName}" not found`);
      return;
    }
    const doc = await vscode.workspace.openTextDocument(skill.filePath);
    await vscode.window.showTextDocument(doc);
  }

  private setupWatcher(): void {
    this._watcher?.dispose();

    const pattern = new vscode.RelativePattern(
      os.homedir(),
      '.claude/skills/*.md'
    );
    this._watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const reload = async () => {
      await this.loadSkills();
      this._onDidChangeSkills.fire(this.getAllSkills());
    };

    this._watcher.onDidCreate(reload);
    this._watcher.onDidChange(reload);
    this._watcher.onDidDelete(reload);
  }

  dispose(): void {
    this._watcher?.dispose();
    this._onDidChangeSkills.dispose();
  }
}
