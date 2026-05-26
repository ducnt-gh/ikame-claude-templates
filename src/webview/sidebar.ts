import './styles.css';
import { SessionListUI } from './components/SessionListUI';

declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();
const ui = new SessionListUI(vscode);
document.getElementById('root')!.appendChild(ui.render());
vscode.postMessage({ type: 'ready' });

window.addEventListener('message', (event) => {
  const msg = event.data as { type: string; payload: unknown };
  if (msg.type === 'sessionList') {
    const d = msg.payload as { sessions: unknown[]; activeId: string | null };
    ui.updateSessions(d.sessions as never, d.activeId);
  }
});
