import * as vscode from 'vscode';
import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export class ClaudeProcessManager {
  private _executablePath: string | null = null;

  async findExecutable(): Promise<string | null> {
    if (this._executablePath) {
      return this._executablePath;
    }

    const config = vscode.workspace.getConfiguration('ikameClaude');
    const customPath = config.get<string>('claudeExecutablePath');

    if (customPath && fs.existsSync(customPath)) {
      this._executablePath = customPath;
      return customPath;
    }

    const candidates = this.getCandidatePaths();
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this._executablePath = candidate;
        return candidate;
      }
    }

    const fromPath = await this.findInPath();
    if (fromPath) {
      this._executablePath = fromPath;
      return fromPath;
    }

    return null;
  }

  private getCandidatePaths(): string[] {
    const home = os.homedir();
    const candidates: string[] = [];

    if (process.platform === 'win32') {
      candidates.push(
        path.join(home, 'AppData', 'Roaming', 'npm', 'claude.cmd'),
        path.join(home, 'AppData', 'Local', 'Programs', 'claude-code', 'claude.exe'),
        'C:\\Program Files\\Claude\\claude.exe'
      );
    } else if (process.platform === 'darwin') {
      candidates.push(
        '/usr/local/bin/claude',
        '/opt/homebrew/bin/claude',
        path.join(home, '.local', 'bin', 'claude')
      );
    } else {
      candidates.push(
        '/usr/local/bin/claude',
        '/usr/bin/claude',
        path.join(home, '.local', 'bin', 'claude')
      );
    }

    return candidates;
  }

  private findLatestClaudeExtension(): string[] {
    try {
      const extensionsDir = path.join(os.homedir(), '.vscode', 'extensions');
      const entries = fs.readdirSync(extensionsDir);
      const claudeExt = entries
        .filter(e => e.startsWith('anthropic.claude-code-'))
        .sort()
        .pop();
      if (claudeExt) return [claudeExt];
    } catch {
      // ignore
    }
    return ['anthropic.claude-code-0.0.0-win32-x64'];
  }

  private findInPath(): Promise<string | null> {
    return new Promise(resolve => {
      if (process.platform === 'win32') {
        // Prefer .cmd over .ps1 — .cmd works with shell:false stdin piping
        cp.exec('where claude.cmd', (err, stdout) => {
          if (!err && stdout.trim()) {
            resolve(stdout.trim().split('\n')[0].trim());
            return;
          }
          cp.exec('where claude', (err2, stdout2) => {
            if (!err2 && stdout2.trim()) {
              // Pick .cmd if listed, else first result
              const lines = stdout2.trim().split('\n').map(l => l.trim());
              const cmd = lines.find(l => l.endsWith('.cmd')) ?? lines[0];
              resolve(cmd ?? null);
            } else {
              resolve(null);
            }
          });
        });
      } else {
        cp.exec('which claude', (err, stdout) => {
          if (!err && stdout.trim()) {
            resolve(stdout.trim().split('\n')[0].trim());
          } else {
            resolve(null);
          }
        });
      }
    });
  }

  spawnWithArgs(execPath: string, args: string[], cwd: string): cp.ChildProcess {
    const config = vscode.workspace.getConfiguration('ikameClaude');
    const extraEnv = config.get<Record<string, string>>('environmentVariables', {});
    const env = { ...process.env, ...extraEnv };

    // On Windows, .cmd is a wrapper — resolve the actual .exe it points to
    if (process.platform === 'win32' && (execPath.endsWith('.cmd') || execPath.endsWith('.bat'))) {
      const resolvedExe = this._resolveExeFromCmd(execPath);
      if (resolvedExe) {
        return cp.spawn(resolvedExe, args, { cwd, env, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
      }
      // fallback: shell mode
      return cp.spawn(execPath, args, { cwd, env, shell: true, stdio: ['pipe', 'pipe', 'pipe'] });
    }

    return cp.spawn(execPath, args, {
      cwd,
      env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }

  private _resolveExeFromCmd(cmdPath: string): string | null {
    try {
      const content = fs.readFileSync(cmdPath, 'utf8');
      // claude.cmd contains: "%dp0%\node_modules\@anthropic-ai\claude-code\bin\claude.exe"  %*
      const match = content.match(/"([^"]+\.exe)"/);
      if (match) {
        const exePath = match[1].replace(/%dp0%/gi, path.dirname(cmdPath));
        if (fs.existsSync(exePath)) return exePath;
      }
    } catch { /* ignore */ }
    return null;
  }
}
