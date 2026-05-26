import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { MemoryEntry, MemoryIndex } from '../types';

export class MemoryManager {
  private _onDidChangeMemory = new vscode.EventEmitter<MemoryIndex>();
  readonly onDidChangeMemory = this._onDidChangeMemory.event;
  private _watcher: vscode.FileSystemWatcher | null = null;

  getMemoryDir(projectPath?: string): string {
    if (projectPath) {
      const sanitized = projectPath
        .replace(/[:\\]/g, '-')
        .replace(/^-+/, '');
      return path.join(os.homedir(), '.claude', 'projects', sanitized, 'memory');
    }
    return path.join(os.homedir(), '.claude', 'memory');
  }

  loadMemoryIndex(projectPath?: string): MemoryIndex {
    const memDir = this.getMemoryDir(projectPath);
    const indexPath = path.join(memDir, 'MEMORY.md');
    const entries: MemoryEntry[] = [];

    if (!fs.existsSync(memDir)) {
      return { entries, indexPath };
    }

    try {
      const files = fs.readdirSync(memDir).filter(
        f => f.endsWith('.md') && f !== 'MEMORY.md'
      );

      for (const file of files) {
        const filePath = path.join(memDir, file);
        const entry = this.parseMemoryFile(filePath);
        if (entry) entries.push(entry);
      }
    } catch {
      // ignore
    }

    this.setupWatcher(memDir);
    return { entries, indexPath };
  }

  private parseMemoryFile(filePath: string): MemoryEntry | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const fileName = path.basename(filePath, '.md');

      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const descMatch = content.match(/^description:\s*(.+)$/m);
      const typeMatch = content.match(/^  type:\s*(.+)$/m);

      const name = nameMatch ? nameMatch[1].trim() : fileName;
      const description = descMatch ? descMatch[1].trim() : '';
      const typeRaw = typeMatch ? typeMatch[1].trim() : 'project';
      const type = (['user', 'feedback', 'project', 'reference'] as const).includes(
        typeRaw as MemoryEntry['type']
      )
        ? (typeRaw as MemoryEntry['type'])
        : 'project';

      return { name, description, type, filePath, content };
    } catch {
      return null;
    }
  }

  buildMemoryContext(projectPath?: string): string {
    const index = this.loadMemoryIndex(projectPath);
    if (index.entries.length === 0) return '';

    const sections = index.entries.map(entry => {
      const body = entry.content
        .replace(/^---[\s\S]*?---\n?/, '')
        .trim();
      return `### Memory: ${entry.name} (${entry.type})\n${body}`;
    });

    return `## Project Memory Context\n\n${sections.join('\n\n')}`;
  }

  async createMemoryEntry(
    name: string,
    type: MemoryEntry['type'],
    content: string,
    projectPath?: string
  ): Promise<MemoryEntry> {
    const memDir = this.getMemoryDir(projectPath);
    fs.mkdirSync(memDir, { recursive: true });

    const filePath = path.join(memDir, `${name}.md`);
    const fileContent = `---
name: ${name}
description: ${content.split('\n')[0].slice(0, 80)}
metadata:
  type: ${type}
---

${content}
`;
    fs.writeFileSync(filePath, fileContent, 'utf-8');

    await this.updateMemoryIndex(memDir);

    return { name, description: content.split('\n')[0], type, filePath, content };
  }

  private async updateMemoryIndex(memDir: string): Promise<void> {
    const indexPath = path.join(memDir, 'MEMORY.md');
    const entries: MemoryEntry[] = [];

    try {
      const files = fs.readdirSync(memDir).filter(
        f => f.endsWith('.md') && f !== 'MEMORY.md'
      );
      for (const file of files) {
        const entry = this.parseMemoryFile(path.join(memDir, file));
        if (entry) entries.push(entry);
      }
    } catch {
      // ignore
    }

    const lines = entries.map(
      e => `- [${e.name}](${path.basename(e.filePath)}) — ${e.description}`
    );
    fs.writeFileSync(indexPath, `# Memory Index\n\n${lines.join('\n')}\n`, 'utf-8');
  }

  private setupWatcher(memDir: string): void {
    this._watcher?.dispose();
    if (!fs.existsSync(memDir)) return;

    const pattern = new vscode.RelativePattern(memDir, '*.md');
    this._watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const reload = () => {
      const projectPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      this._onDidChangeMemory.fire(this.loadMemoryIndex(projectPath));
    };

    this._watcher.onDidCreate(reload);
    this._watcher.onDidChange(reload);
    this._watcher.onDidDelete(reload);
  }

  dispose(): void {
    this._watcher?.dispose();
    this._onDidChangeMemory.dispose();
  }
}
