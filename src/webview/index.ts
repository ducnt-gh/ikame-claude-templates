import './styles.css';
import { App } from './App';

declare function acquireVsCodeApi(): {
  postMessage: (message: unknown) => void;
  getState: () => unknown;
  setState: (state: unknown) => void;
};

const vscode = acquireVsCodeApi();
const app = new App(vscode);
app.mount(document.getElementById('root')!);

window.addEventListener('message', (event) => {
  app.handleExtensionMessage(event.data);
});
