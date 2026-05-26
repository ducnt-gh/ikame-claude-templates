import { Skill, Agent, MemoryIndex } from '../../types';
import { marked } from 'marked';

interface VsCodeApi {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (s: unknown) => void;
}

interface StoredMsg { role: 'user'|'assistant'|'system'; content: string; attachments?: string[]; }
interface StoredTool { id: string; name: string; input?: Record<string,unknown>; result?: string; status?: 'done'|'denied'|'error'; diff?: string; }
interface Session { id: string; title: string; msgs: StoredMsg[]; createdAt: number; }

interface PermItem { id: string; tool: string; path?: string; }
interface PermReq { items: PermItem[]; }
interface ToolEvt { id: string; name: string; input?: Record<string,unknown>; result?: string; running: boolean | 'waiting' | 'denied'; isError?: boolean; diff?: string; }

interface DiffLine { type: 'add'|'del'|'ctx'; content: string; lineNum?: number; }
interface DiffFile { filename: string; lines: DiffLine[]; msgId?: string; }

// ─── Auth state ───────────────────────────────────────────
type AuthState = 'checking' | 'unauthenticated' | 'authenticated';

// ─── Constants ────────────────────────────────────────────

// Mode icon keys reference SVG icons defined in `I` below
const MODES = [
  { id:'default',           label:'Ask before edits',   desc:'Claude will ask for approval before making each edit',                           iconKey:'modeDefault' as const },
  { id:'acceptEdits',       label:'Edit automatically', desc:'Claude will edit your selected text or the whole file',                          iconKey:'modeEdit'    as const },
  { id:'plan',              label:'Plan mode',           desc:'Claude will explore the code and present a plan before editing',                 iconKey:'modePlan'    as const },
  { id:'bypassPermissions', label:'Bypass permissions',  desc:'Claude will not ask for approval before running potentially dangerous commands', iconKey:'modeBypass'  as const },
];

const MODELS = [
  { id:'claude-sonnet-4-6',         name:'Claude Sonnet 4.6', desc:'Balanced · Recommended' },
  { id:'claude-opus-4-7',           name:'Claude Opus 4.7',   desc:'Most capable' },
  { id:'claude-haiku-4-5-20251001', name:'Claude Haiku 4.5',  desc:'Fastest' },
];

const COMMANDS = [
  { id:'compact',         label:'/compact',         desc:'Compact conversation to save context',          section:'Actions' },
  { id:'clear',           label:'/clear',           desc:'Clear conversation history',                    section:'Actions' },
  { id:'usage',           label:'/usage',           desc:'View token usage and rate limits',              section:'Actions' },
  { id:'memory',          label:'/memory',          desc:'View and edit memory files',                    section:'Customize' },
  { id:'security-review', label:'/security-review', desc:'Run a security review of the current project', section:'Actions' },
];

// ─── SVGs ──────────────────────────────────────────────────

const I = {
  plus:        `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2a1 1 0 011 1v4h4a1 1 0 010 2H9v4a1 1 0 01-2 0V9H3a1 1 0 010-2h4V3a1 1 0 011-1z"/></svg>`,
  history:     `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 2"/></svg>`,
  newchat:     `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 9.5a6 6 0 01-8.5 5.4L2 16l1.1-3.5A6 6 0 1114 9.5z"/><path d="M8 6.5v4M6 8.5h4" stroke-linecap="round"/></svg>`,
  send:        `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M14.5 8L2 14l2.5-6H2L14.5 2 12 8h2.5z"/></svg>`,
  stop:        `<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="8" height="8" rx="1.5"/></svg>`,
  attach:      `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12.5 7l-5 5a3.5 3.5 0 01-5-5l5-5a2 2 0 013 3l-5 5a.5.5 0 01-1-1l4.5-4.5"/></svg>`,
  slash:       `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M9.5 2l-4 12h1.5l4-12z"/></svg>`,
  compact:     `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13.5 4A6 6 0 104 13.5"/><path d="M13.5 7.5V4H10"/></svg>`,
  plan:        `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`,
  trash:       `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h8M5 3V2h2v1M3 3l1 7h4l1-7"/></svg>`,
  edit:        `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z"/></svg>`,
  check:       `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 6l3 3 5-5"/></svg>`,
  chevD:       `<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor"><path d="M2 3.5l3 3 3-3"/></svg>`,
  eye:         `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 8s3-5 7-5 7 5 7 5-3 5-7 5-7-5-7-5z"/><circle cx="8" cy="8" r="2"/></svg>`,
  eyeOff:      `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 2l12 12M6.5 6.5A2 2 0 009.5 9.5M4 4.5C2.8 5.6 2 7 2 7s3 5 6 5c1 0 2-.3 2.8-.8M11 4c.8.5 2 1.8 3 3.1 0 0-.6 1.3-1.5 2.5"/></svg>`,
  rewind:      `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3V1L5 4l3 3V5a4 4 0 110 8H3"/></svg>`,
  error:       `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1a7 7 0 100 14A7 7 0 008 1zm-.75 4a.75.75 0 011.5 0v3.5a.75.75 0 01-1.5 0V5zm.75 7a1 1 0 110-2 1 1 0 010 2z"/></svg>`,
  thinking:    `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v4M8 11v.5"/></svg>`,
  // Mode icons
  modeDefault: `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>`,
  modeEdit:    `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2.5l2.5 2.5L5 13.5H2.5V11L11 2.5z"/></svg>`,
  modePlan:    `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`,
  modeAuto:    `<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1l1.5 4.5H14l-3.75 2.75 1.5 4.5L8 10l-3.75 2.75 1.5-4.5L2 5.5h4.5L8 1z"/></svg>`,
  modeBypass:  `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2l5.5 10H2.5L8 2z"/><path d="M8 7v2.5M8 11v.5"/></svg>`,
  shield:      `<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2L3 4.5v4C3 11.5 5.5 14 8 15c2.5-1 5-3.5 5-6.5v-4L8 2z"/></svg>`,
  paperclip:   `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M13 7l-5.5 5.5a4 4 0 01-5.5-5.5l6-6a2.5 2.5 0 013.5 3.5L5.5 10a1 1 0 01-1.5-1.5L10 3"/></svg>`,
  folder:      `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 4.5A1.5 1.5 0 013.5 3h3l1.5 2H13a1.5 1.5 0 011.5 1.5v6A1.5 1.5 0 0113 14H3a1.5 1.5 0 01-1.5-1.5v-9z"/></svg>`,
  globe:       `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-2 2-3 4-3 6s1 4 3 6M8 2c2 2 3 4 3 6s-1 4-3 6"/></svg>`,
  openFile:    `<svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V7"/><path d="M9 2l4 4M9 2v4h4"/></svg>`,
};

// ═══════════════════════════════════════════════════════════

export class ChatUI {
  private _vs: VsCodeApi;

  // DOM
  private _rootEl!: HTMLElement;
  private _msgsEl!: HTMLElement;
  private _userScrolledUp = false; // true when user has scrolled away from bottom during streaming
  private _textareaEl!: HTMLTextAreaElement;
  private _sendBtnEl!: HTMLButtonElement;
  private _acEl!: HTMLElement;       // autocomplete popup
  private _cmdMenuEl!: HTMLElement;  // /command menu
  private _modeMenuEl!: HTMLElement;
  private _modeBtnEl!: HTMLButtonElement;
  private _modelMenuEl!: HTMLElement;
  private _modelBtnEl!: HTMLButtonElement;
  private _sessPanel!: HTMLElement;
  private _sessList!: HTMLElement;
  private _attachedEl!: HTMLElement;
  private _mentionEl!: HTMLElement;
  private _ctxBarFill!: HTMLElement;
  private _ctxBarEl!: HTMLElement;
  private _ctxIndicator!: HTMLElement;
  private _selectionIndicator!: HTMLElement;

  // State
  private _skills: Skill[] = [];
  private _agents: Agent[] = [];
  private _sessions: Session[] = [];
  private _curSessionId: string|null = null;
  private _streaming = false;
  private _statusEl!: HTMLElement;
  private _statusTimer?: ReturnType<typeof setTimeout>;
  private _statusTypeIdx = 0;
  private _statusCharIdx = 0;
  private _statusErasing = false;
  private _curAssistBody: HTMLElement|null = null;
  private _curThinking: HTMLDetailsElement|null = null;
  private _toolBlocks = new Map<string, HTMLDetailsElement>();
  private _pendingTools = new Map<string, StoredTool>();
  private _attachments: string[] = [];
  private _inlineFiles: Array<{ name: string; content: string }> = [];
  private _mentions: string[] = [];
  private _model = MODELS[0].id;
  private _mode  = MODES[0].id;
  private _effort: 'low'|'medium'|'high'|'max' = 'medium';
  private _thinkingOn = false;
  private _showSelection = true;
  private _ctxPct = 0;
  private _acItems: Array<{label:string;desc:string;value:string;icon:string;type:string}> = [];
  private _acIdx = 0;
  private _cmdItems: typeof COMMANDS = [];
  private _cmdIdx = 0;
  private _pendingDiffs = new Map<string,DiffFile>();
  private _memory: MemoryIndex | null = null;
  private _msgCounter = 0;
  private _ctrlEnterToSend = false;
  private _authState: AuthState = 'authenticated'; // default assume authed (CLI handles auth)
  private _headerTitleEl!: HTMLElement;
  private _usedTokens = 0;
  private _contextWindow = 0;
  private _addMenuEl!: HTMLElement;
  private _compactBtnEl!: HTMLButtonElement;
  private _compactPopupEl!: HTMLElement;
  private _inputBoxEl!: HTMLElement;
  private _permOverlayEl!: HTMLElement;
  private _chatAreaEl!: HTMLElement;
  private _pendingQueue: Array<{text: string; model: string; mode: string}> = [];

  constructor(vs: VsCodeApi) {
    this._vs = vs;
    this._loadState();
  }

  // ─── Public API ────────────────────────────────────────

  setAuthState(state: AuthState): void {
    this._authState = state;
    if (state === 'unauthenticated') {
      this._rootEl.innerHTML = '';
      this._rootEl.appendChild(this._buildAuthScreen());
    } else if (state === 'authenticated') {
      this._rootEl.innerHTML = '';
      this._rootEl.append(this._buildHeader(), this._buildBody());
      this._rePortalOverlays();
    }
  }

  private _rePortalOverlays(): void {
    document.body.append(
      this._addMenuEl,
      this._cmdMenuEl,
      this._modeMenuEl,
      this._modelMenuEl,
      this._compactPopupEl,
    );
  }

  private _buildAuthScreen(): HTMLElement {
    const screen = mk('div','auth-screen');
    const logo = mk('div','auth-logo'); logo.textContent = 'C';
    const title = mk('h2','auth-title'); title.textContent = 'Welcome to Ikame Claude Code';
    const sub = mk('p','auth-sub'); sub.textContent = 'Claude Code can be used with your Claude subscription or billed based on API usage through your Console account.';
    const sub2 = mk('p','auth-sub'); sub2.textContent = 'How do you want to log in?';

    const mkAuthBtn = (label: string, primary: boolean, action: string) => {
      const btn = document.createElement('button');
      btn.className = `auth-btn${primary?' primary':''}`;
      btn.textContent = label;
      btn.onclick = () => this._vs.postMessage({type:'runCommand', payload:'auth:'+action});
      return btn;
    };

    const claudeAiBtn = mkAuthBtn('Claude.ai Subscription', true, 'claudeai');
    const claudeAiNote = mk('p','auth-note'); claudeAiNote.textContent = 'Use your Claude Pro, Team, or Enterprise subscription';
    const consoleBtn = mkAuthBtn('Anthropic Console', false, 'console');
    const consoleNote = mk('p','auth-note'); consoleNote.textContent = 'Pay for API usage through your Console account';
    const bedrockBtn = mkAuthBtn('Bedrock, Vertex, or third-party', false, 'bedrock');
    const bedrockNote = mk('p','auth-note'); bedrockNote.textContent = 'Use your own cloud provider credentials';

    screen.append(logo, title, sub, sub2, claudeAiBtn, claudeAiNote, consoleBtn, consoleNote, bedrockBtn, bedrockNote);
    return screen;
  }

  render(): HTMLElement {
    this._rootEl = mk('div','app');
    this._rootEl.append(
      this._buildHeader(),
      this._buildBody()
    );
    // Portal all overlay menus to document.body so they escape overflow:hidden containers
    this._rePortalOverlays();
    document.addEventListener('click', () => {
      this._modeMenuEl?.classList.add('hidden');
      this._modelMenuEl?.classList.add('hidden');
      this._cmdMenuEl?.classList.add('hidden');
      this._addMenuEl?.classList.add('hidden');
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this._modeMenuEl?.classList.add('hidden');
        this._modelMenuEl?.classList.add('hidden');
        this._cmdMenuEl?.classList.add('hidden');
        this._acEl?.classList.add('hidden');
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const sel = window.getSelection();
        if (sel && sel.toString().length > 0) {
          this._vs.postMessage({ type: 'copyToClipboard', payload: sel.toString() });
        }
      }
    });
    return this._rootEl;
  }

  appendChunk(chunk: string): void {
    if (!this._curAssistBody) this._startAssist();
    const body = this._curAssistBody!;
    body.querySelector('.loading-dots')?.remove();
    body.querySelector('.stream-cursor')?.remove();
    const raw = (body.dataset.raw ?? '') + chunk;
    body.dataset.raw = raw;
    this._renderMdInto(body, raw);
    const cursor = mk('span','stream-cursor'); body.appendChild(cursor);
    // Keep status label pinned at bottom
    if (this._statusEl?.isConnected) body.appendChild(this._statusEl);
    this._scroll();
  }

  onPermissionPending(): void {
    this._streaming = false;
    this._stopStatusAnim();
    this._updateSendBtn();
    // Show "waiting" indicator in the current assistant bubble if present
    if (this._curAssistBody) {
      this._curAssistBody.querySelector('.loading-dots')?.remove();
      this._curAssistBody.querySelector('.stream-cursor')?.remove();
      this._curAssistBody.querySelector('.perm-wait-hint')?.remove();
      const hint = mk('div', 'perm-wait-hint');
      hint.textContent = 'Waiting for your approval…';
      this._curAssistBody.appendChild(hint);
    }
  }

  onStreamResumed(): void {
    this._streaming = true;
    this._updateSendBtn();
    if (this._curAssistBody) {
      this._curAssistBody.querySelector('.perm-wait-hint')?.remove();
      // Re-create status label at bottom of existing bubble
      this._stopStatusAnim();
      this._statusEl = this._makeStatusEl();
      this._curAssistBody.appendChild(this._statusEl);
      this._startStatusAnim();
    }
  }

  finishMessage(): void {
    this._streaming = false;
    this._userScrolledUp = false;
    this._stopStatusAnim();
    if (this._curAssistBody) {
      this._curAssistBody.querySelector('.stream-cursor')?.remove();
      this._curAssistBody.querySelector('.loading-dots')?.remove();
      const raw = this._curAssistBody.dataset.raw ?? '';
      if (this._pendingTools.size > 0) {
        this._storeMsg('system', JSON.stringify({ tools: Array.from(this._pendingTools.values()) }));
      }
      if (raw) this._storeMsg('assistant', raw);
    }
    this._pendingTools.clear();
    this._curAssistBody = null; this._curThinking = null;
    this._scroll();

    // Drain queued message
    const next = this._pendingQueue.shift();
    if (next) {
      this._startAssist();
      this._vs.postMessage({type:'sendMessage', payload:{text:next.text, model:next.model, mode:next.mode}});
    }
    this._updateSendBtn();
  }

  private _updateSendBtn(): void {
    const hasText = this._textareaEl.value.trim().length > 0 || this._attachments.length > 0;
    if (this._streaming && !hasText) {
      this._sendBtnEl.innerHTML = I.stop; this._sendBtnEl.classList.add('stop');
      this._sendBtnEl.title = 'Stop (Esc)';
    } else {
      this._sendBtnEl.innerHTML = I.send; this._sendBtnEl.classList.remove('stop');
      this._sendBtnEl.title = 'Send (Enter)';
    }
  }

  showError(msg: string): void {
    this.finishMessage();
    const w = mk('div','msg-wrap');
    const b = mk('div','error-banner');
    b.innerHTML = `${I.error} <span>${esc(msg)}</span>`;
    w.appendChild(b); this._msgsEl.appendChild(w); this._scroll();
  }

  updateThinking(text: string): void {
    if (!this._curAssistBody || !this._thinkingOn) return;
    this._curAssistBody.querySelector('.loading-dots')?.remove();
    if (!this._curThinking) {
      this._curThinking = document.createElement('details') as HTMLDetailsElement;
      this._curThinking.className = 'thinking-block';
      const sum = document.createElement('summary');
      sum.innerHTML = `<span class="arrow">▶</span> ${I.thinking} Thinking…`;
      const content = mk('div','thinking-content');
      this._curThinking.append(sum, content);
      this._curAssistBody.insertBefore(this._curThinking, this._curAssistBody.firstChild);
    }
    (this._curThinking.querySelector('.thinking-content') as HTMLElement).textContent = text;
    this._scroll();
  }

  showToolUse(t: ToolEvt): void {
    if (!this._curAssistBody) return;
    this._curAssistBody.querySelector('.loading-dots')?.remove();
    let block = this._toolBlocks.get(t.id);
    if (!block) {
      block = document.createElement('details') as HTMLDetailsElement;
      block.className = 'tool-block tool-running';
      block.open = false;
      const { icon, label, detail, filePath } = _toolMeta(t.name, t.input);
      block.innerHTML = `
        <summary class="tool-summary">
          <span class="tool-chevron">${I.chevD}</span>
          <span class="tool-icon-wrap">${icon}</span>
          <span class="tool-label">${esc(label)}</span>
          <span class="tool-detail">${esc(detail)}</span>
          ${filePath ? `<button class="tool-open-btn" title="Open file">${I.openFile}</button>` : ''}
          <span class="tool-status running"></span>
        </summary>
        <div class="tool-body">${t.diff ? _renderDiff(t.diff) : '<span class="tool-body-waiting">Running…</span>'}</div>`;
      if (filePath) {
        const btn = block.querySelector('.tool-open-btn') as HTMLElement;
        btn.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          this._vs.postMessage({ type: 'openFile', payload: filePath });
        };
      }
      this._curAssistBody.appendChild(block);
      this._toolBlocks.set(t.id, block);
      this._pendingTools.set(t.id, { id: t.id, name: t.name, input: t.input });
    }
    if (t.running === 'waiting') {
      block.classList.add('tool-running');
      const status = block?.querySelector('.tool-status') as HTMLElement | null;
      if (status) { status.className = 'tool-status running'; status.innerHTML = ''; }
      // Update diff if retry has new diff
      if (t.diff) {
        const body = block?.querySelector('.tool-body') as HTMLElement | null;
        if (body) body.innerHTML = _renderDiff(t.diff);
      }
      if (this._statusEl?.isConnected) this._curAssistBody.appendChild(this._statusEl);
      this._scroll();
      return;
    } else if (t.running === 'denied') {
      block.classList.remove('tool-running');
      const status = block?.querySelector('.tool-status') as HTMLElement | null;
      if (status) { status.className = 'tool-status denied'; status.innerHTML = ''; }
      const pt = this._pendingTools.get(t.id);
      if (pt) { pt.status = 'denied'; }
      if (this._statusEl?.isConnected) this._curAssistBody.appendChild(this._statusEl);
      this._scroll();
      return;
    } else if (!t.running) {
      block.classList.remove('tool-running');
      const finalStatus = t.isError ? 'denied' : 'done';
      const status = block.querySelector('.tool-status') as HTMLElement;
      status.className = `tool-status ${finalStatus}`;
      status.innerHTML = '';
      const body = block.querySelector('.tool-body') as HTMLElement;
      // Only replace body if no diff was rendered
      if (!body.querySelector('.diff-view')) {
        body.querySelector('.tool-body-waiting')?.remove();
        if (t.result !== undefined) {
          body.innerHTML = _formatToolResult(t.name, t.result);
        }
      } else {
        body.querySelector('.tool-body-waiting')?.remove();
      }
      const pt = this._pendingTools.get(t.id);
      if (pt) { pt.result = t.result; pt.status = finalStatus; if (t.diff) pt.diff = t.diff; }
    }
    // Keep status label pinned at bottom of the bubble
    if (this._statusEl?.isConnected) this._curAssistBody.appendChild(this._statusEl);
    this._scroll();
  }

  showPermissionRequest(req: PermReq): void {
    const overlay = this._permOverlayEl;
    overlay.innerHTML = '';

    const dismiss = () => {
      overlay.classList.add('hidden');
      this._inputBoxEl.style.display = '';
      this._msgsEl.style.paddingBottom = '';
    };

    this._inputBoxEl.style.display = 'none';

    const items = req.items;
    const firstId = items[0]?.id ?? '';
    const firstTool = items[0]?.tool ?? '';

    // Title
    const title = mk('div', 'perm-title');
    if (items.length === 1) {
      const item = items[0];
      if (item.path) {
        title.innerHTML = `${_actionVerb(item.tool)} <span class="perm-title-path">${esc(item.path)}</span>?`;
      } else {
        title.textContent = `Claude wants to use ${item.tool}`;
      }
    } else {
      title.textContent = `Claude wants to run ${items.length} operations:`;
      const list = mk('div', 'perm-item-list');
      items.forEach(it => {
        const row = mk('div', 'perm-item-row');
        row.innerHTML = `<span class="perm-item-tool">${esc(it.tool)}</span>${it.path ? ` <span class="perm-item-path">${esc(it.path)}</span>` : ''}`;
        list.appendChild(row);
      });
      overlay.appendChild(title);
      overlay.appendChild(list);
    }

    const respond = (action: string) => {
      this._vs.postMessage({ type: 'permissionResponse', payload: { id: firstId, action, tool: firstTool } });
      dismiss();
    };

    // Numbered option rows
    const opts = mk('div', 'perm-opts');
    const mkOpt = (num: number, label: string, cls: string, fn: () => void) => {
      const row = mk('div', `perm-opt ${cls}`);
      const badge = mk('span', 'perm-opt-num'); badge.textContent = String(num);
      const lbl = mk('span', 'perm-opt-lbl'); lbl.textContent = label;
      row.append(badge, lbl);
      row.onclick = fn;
      return row;
    };

    opts.append(
      mkOpt(1, 'Yes', 'perm-opt-yes', () => respond('allow')),
      mkOpt(2, 'Yes, allow all edits this session', '', () => respond('alwaysAllow')),
      mkOpt(3, 'No', 'perm-opt-no', () => respond('deny')),
    );

    // "Tell Claude what to do instead" input
    const instrWrap = mk('div', 'perm-instr-wrap');
    const instrInput = document.createElement('input');
    instrInput.className = 'perm-instr-input';
    instrInput.placeholder = 'Tell Claude what to do instead';
    instrInput.onkeydown = (e) => {
      if (e.key === 'Enter' && instrInput.value.trim()) {
        this._vs.postMessage({ type: 'permissionResponse', payload: { id: firstId, action: 'deny', tool: firstTool, instruction: instrInput.value.trim() } });
        this._vs.postMessage({ type: 'sendMessage', payload: { text: instrInput.value.trim() } });
        dismiss();
      }
      if (e.key === 'Escape') { dismiss(); }
    };
    instrWrap.appendChild(instrInput);

    const escHint = mk('div', 'perm-esc-hint'); escHint.textContent = 'Esc to cancel';

    if (items.length === 1) overlay.appendChild(title);
    overlay.append(opts, instrWrap, escHint);
    overlay.classList.remove('hidden');

    requestAnimationFrame(() => {
      this._msgsEl.style.paddingBottom = `${overlay.offsetHeight + 8}px`;
      this._scroll();
    });

    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === '1') { opts.children[0]?.dispatchEvent(new MouseEvent('click')); }
      else if (e.key === '2') { opts.children[1]?.dispatchEvent(new MouseEvent('click')); }
      else if (e.key === '3') { opts.children[2]?.dispatchEvent(new MouseEvent('click')); }
      else if (e.key === 'Escape') { dismiss(); }
      else { return; }
      document.removeEventListener('keydown', keyHandler);
    };
    document.addEventListener('keydown', keyHandler);
  }

  showAskQuestion(payload: {
    toolUseId: string;
    questions: Array<{
      question: string; header: string;
      options: Array<{ label: string; description?: string }>;
      multiSelect: boolean;
    }>;
  }): void {
    const overlay = this._permOverlayEl;
    overlay.innerHTML = '';
    this._inputBoxEl.style.display = 'none';

    const answers: Record<string, string> = {};
    const otherInputs: Map<number, HTMLInputElement> = new Map();

    const dismiss = () => {
      overlay.classList.add('hidden');
      this._inputBoxEl.style.display = '';
      this._msgsEl.style.paddingBottom = '';
    };

    const wrap = mk('div', 'ask-question-wrap');

    payload.questions.forEach((q, qi) => {
      const qWrap = mk('div', 'ask-q-wrap');
      const qText = mk('div', 'ask-q-text');
      qText.textContent = q.question;
      qWrap.appendChild(qText);

      const selectedLabels = new Set<string>();

      q.options.forEach(opt => {
        const row = mk('div', 'ask-q-option');
        const lbl = mk('span', 'ask-q-opt-label'); lbl.textContent = opt.label;
        row.appendChild(lbl);
        if (opt.description) {
          const desc = mk('span', 'ask-q-opt-desc'); desc.textContent = opt.description;
          row.appendChild(desc);
        }
        row.onclick = () => {
          if (q.multiSelect) {
            row.classList.toggle('selected');
            if (selectedLabels.has(opt.label)) selectedLabels.delete(opt.label);
            else selectedLabels.add(opt.label);
            answers[q.question] = [...selectedLabels].join(', ');
          } else {
            qWrap.querySelectorAll('.ask-q-option.selected').forEach(el => el.classList.remove('selected'));
            row.classList.add('selected');
            answers[q.question] = opt.label;
          }
        };
        qWrap.appendChild(row);
      });

      // "Other" free text
      const otherInput = document.createElement('input');
      otherInput.className = 'ask-q-other-input';
      otherInput.placeholder = 'Other (type here)…';
      otherInput.oninput = () => {
        if (otherInput.value.trim()) {
          answers[q.question] = otherInput.value.trim();
          qWrap.querySelectorAll('.ask-q-option.selected').forEach(el => el.classList.remove('selected'));
        }
      };
      otherInputs.set(qi, otherInput);
      qWrap.appendChild(otherInput);

      wrap.appendChild(qWrap);
    });

    const submitBtn = document.createElement('button');
    submitBtn.className = 'ask-q-submit';
    submitBtn.textContent = 'Submit';
    submitBtn.onclick = () => {
      this._vs.postMessage({ type: 'questionAnswer', payload: { toolUseId: payload.toolUseId, answers } });
      dismiss();
    };
    wrap.appendChild(submitBtn);

    overlay.appendChild(wrap);
    overlay.classList.remove('hidden');

    requestAnimationFrame(() => {
      this._msgsEl.style.paddingBottom = `${overlay.offsetHeight + 8}px`;
      this._scroll();
    });
  }

  showDiff(diff: DiffFile): void {
    const msgId = diff.msgId ?? `diff_${Date.now()}`;
    this._pendingDiffs.set(msgId, diff);
    const w = mk('div','msg-wrap');
    const blk = mk('div','diff-block');
    const hdr = mk('div','diff-header');
    const fn = mk('span','diff-filename'); fn.textContent = diff.filename;
    const acts = mk('div','diff-actions');
    const acc = document.createElement('button'); acc.className = 'diff-accept'; acc.textContent = 'Accept';
    const rej = document.createElement('button'); rej.className = 'diff-reject'; rej.textContent = 'Reject';
    acc.onclick = () => { this._vs.postMessage({type:'acceptDiff',payload:msgId}); w.remove(); };
    rej.onclick = () => { this._vs.postMessage({type:'rejectDiff',payload:msgId}); w.remove(); };
    acts.append(acc, rej);
    hdr.append(fn, acts);
    const body = mk('div','diff-body');
    diff.lines.forEach((l, i) => {
      const row = mk('div',`diff-line ${l.type}`);
      const num = mk('span','diff-line-num'); num.textContent = String(l.lineNum ?? i+1);
      const cnt = mk('span','diff-line-content'); cnt.textContent = l.content;
      row.append(num, cnt); body.appendChild(row);
    });
    blk.append(hdr, body); w.appendChild(blk);
    this._msgsEl.appendChild(w); this._scroll();
  }

  updateContext(pct: number): void {
    this._ctxPct = pct;
    const w = Math.min(100, Math.max(0, pct));
    this._ctxBarFill.style.width = w + '%';
    this._ctxBarEl.className = `ctx-bar${w >= 90 ? ' crit' : w >= 70 ? ' warn' : ''}`;
    // Only update usedTokens from pct if we don't have real token counts yet.
    // If contextWindow is known, usedTokens is already set correctly by updateContextTokens().
    if (this._contextWindow === 0) {
      this._usedTokens = w;
    }
    this._renderCompactBtn();
  }

  updateContextTokens(used: number, total: number): void {
    this._usedTokens = used;
    this._contextWindow = total;
    const pct = total > 0 ? Math.round((used / total) * 100) : 0;
    this.updateContext(pct);
  }

  onCompactStart(): void {
    this._streaming = true;
    this._updateSendBtn();
    this._startStatusAnim();
    this._appendMeta('Compacting conversation…');
  }

  onCompactDone(summary: string): void {
    this._streaming = false;
    this._stopStatusAnim();
    this._updateSendBtn();
    this.updateContext(0);

    // Show the summary in chat so user can see what was preserved
    this._msgsEl.querySelector('.empty-state')?.remove();
    const w = mk('div', 'msg-wrap assistant');
    const row = mk('div', 'assistant-row');
    const av = mk('div', 'avatar'); av.textContent = 'C';
    const body = mk('div', 'assistant-body');
    const badge = mk('div', 'compact-summary-badge'); badge.textContent = 'Conversation Summary';
    const content = mk('div', 'md-content');
    content.innerHTML = this._parseMd(summary);
    body.append(badge, content);
    row.append(av, body); w.appendChild(row);
    this._msgsEl.appendChild(w);

    this._appendMeta('Session compacted. Continuing with summary as context.');
    this._scroll();

    // Store summary as the first user message of the new session so Claude has context on resume
    this._storeMsg('user', `[Conversation summary from compact]\n\n${summary}`);
  }

  updateSkills(s: Skill[]): void { this._skills = s; }
  updateAgents(a: Agent[]): void { this._agents = a; }

  updateMemory(m: MemoryIndex): void {
    this._memory = m;
  }

  insertMentionFromEditor(text: string): void {
    // Insert @mention text at cursor in textarea
    const ta = this._textareaEl;
    const pos = ta.selectionStart ?? ta.value.length;
    const before = ta.value.slice(0, pos);
    const after  = ta.value.slice(pos);
    const mention = text.startsWith('@') ? text : `@${text}`;
    ta.value = before + mention + ' ' + after;
    ta.selectionStart = ta.selectionEnd = pos + mention.length + 1;
    ta.dispatchEvent(new Event('input'));
    ta.focus();
  }

  triggerNewSession(): void {
    this._curSessionId = null; this._streaming = false;
    this._updateSendBtn();
    this._curAssistBody = null; this._curThinking = null;
    this._toolBlocks.clear(); this._msgCounter = 0;
    this._showEmpty(); this.updateContext(0);
    this._ensureSession();
    this._updateHeaderTitle();
    this._saveState(); this._renderSessions('');
  }

  loadSessionData(session: { id: string; title: string; msgs: unknown[]; createdAt: number }): void {
    // Add or replace session in local list
    const idx = this._sessions.findIndex(s => s.id === session.id);
    const s = session as Session;
    if (idx >= 0) {
      this._sessions[idx] = s;
    } else {
      this._sessions.unshift(s);
    }
    this._curSessionId = session.id;
    this._streaming = false;
    this._updateSendBtn();
    this._curAssistBody = null; this._curThinking = null;
    this._toolBlocks.clear(); this._msgCounter = 0;
    this._loadSession(session.id);
    this._updateHeaderTitle();
    this._saveState();
  }

  private _updateHeaderTitle(): void {
    const s = this._sessions.find(s => s.id === this._curSessionId);
    this._headerTitleEl.textContent = s ? s.title : 'New Conversation';
  }

  private _renameCurrentSession(): void {
    const s = this._sessions.find(s => s.id === this._curSessionId);
    if (!s) return;
    const titleEl = this._headerTitleEl;
    const prev = s.title;
    const input = document.createElement('input');
    input.className = 'header-title-input';
    input.value = prev;
    titleEl.replaceWith(input);
    input.focus();
    input.select();
    const commit = () => {
      const v = input.value.trim();
      if (v) s.title = v;
      input.replaceWith(titleEl);
      titleEl.textContent = s.title;
      this._renderSessions('');
      this._saveState();
      this._vs.postMessage({ type: 'saveSession', payload: s });
    };
    input.onblur = commit;
    input.onkeydown = e => {
      if (e.key === 'Enter') { input.blur(); }
      if (e.key === 'Escape') { input.value = prev; input.blur(); }
    };
  }

  applyConfig(cfg: Record<string, unknown>): void {
    if (typeof cfg['useCtrlEnterToSend'] === 'boolean') {
      this._ctrlEnterToSend = cfg['useCtrlEnterToSend'] as boolean;
    }
    if (typeof cfg['model'] === 'string') {
      this._model = cfg['model'] as string;
      this._updateModelBtn();
    }
    if (typeof cfg['initialPermissionMode'] === 'string') {
      this._mode = cfg['initialPermissionMode'] as string;
      this._updateModeBtn();
    }
  }

  addAttachedFile(f: string): void {
    // If this is a real path resolving a pending placeholder, replace it
    if (!f.startsWith('[')) {
      const fname = f.replace(/\\/g, '/').split('/').pop() ?? f;
      // Match pending by base name ignoring extension (image may be converted .png→.jpg)
      const fbase = fname.replace(/\.[^.]+$/, '');
      const pendingIdx = this._attachments.findIndex(a => {
        if (!a.startsWith('[pending:')) return false;
        const pname = a.slice(9, -1).replace(/\.[^.]+$/, '');
        return pname === fbase;
      });
      if (pendingIdx >= 0) {
        const pendingKey = this._attachments[pendingIdx];
        this._attachments[pendingIdx] = f;
        const chips = Array.from(this._attachedEl.querySelectorAll('.file-chip'));
        const pendingChip = chips.find(c => c.getAttribute('data-key') === pendingKey);
        if (pendingChip) {
          pendingChip.setAttribute('data-key', f);
          pendingChip.querySelector('.file-chip-name')!.textContent = fname;
          (pendingChip as HTMLElement).title = fname;
          pendingChip.querySelector('button')!.onclick = () => {
            this._attachments = this._attachments.filter(x => x !== f);
            pendingChip.remove();
          };
        }
        return;
      }
      // No matching pending — remove any stale pending chip with same base name
      const stalePending = this._attachments.findIndex(a => a.startsWith('[pending:') && a.slice(9,-1).replace(/\.[^.]+$/,'') === fbase);
      if (stalePending >= 0) {
        const staleKey = this._attachments[stalePending];
        this._attachments.splice(stalePending, 1);
        this._attachedEl.querySelector(`[data-key="${CSS.escape(staleKey)}"]`)?.remove();
      }
    }
    if (this._attachments.includes(f)) return;
    this._attachments.push(f);
    this._updateSendBtn();
    const chip = mk('div','file-chip');
    chip.setAttribute('data-key', f);
    const isInline = f.startsWith('[inline:');
    const isPending = f.startsWith('[pending:');
    const displayName = isInline ? f.slice(8, -1) : isPending ? f.slice(9, -1) : (f.replace(/\\/g, '/').split('/').pop() ?? f);
    chip.title = isInline || isPending ? displayName : f;
    const nameSpan = mk('span', 'file-chip-name'); nameSpan.textContent = displayName;
    chip.innerHTML = `📄 `;
    chip.appendChild(nameSpan);
    const xBtn = document.createElement('button'); xBtn.className = 'file-chip-x'; xBtn.textContent = '×';
    xBtn.onclick = () => {
      this._attachments = this._attachments.filter(x => x !== f);
      if (isInline) this._inlineFiles = this._inlineFiles.filter(x => x.name !== displayName);
      chip.remove();
      this._updateSendBtn();
    };
    chip.appendChild(xBtn);
    this._attachedEl.appendChild(chip);
  }

  showSelectionCount(lines: number): void {
    if (!this._selectionIndicator) return;
    if (lines > 0 && this._showSelection) {
      this._selectionIndicator.style.display = 'flex';
      this._selectionIndicator.querySelector('span')!.textContent = `${lines} lines selected`;
    } else {
      this._selectionIndicator.style.display = 'none';
    }
  }

  // ─── Header ────────────────────────────────────────────

  private _buildHeader(): HTMLElement {
    const hdr = mk('div','header');
    const logo = mk('div','header-logo'); logo.textContent = 'C';
    const titleWrap = mk('div','header-title-wrap');
    this._headerTitleEl = mk('span','header-title'); this._headerTitleEl.textContent = 'New Conversation';
    const editTitleBtn = ibtn(I.edit, 'Rename session');
    editTitleBtn.className = 'header-edit-btn';
    editTitleBtn.onclick = () => this._renameCurrentSession();
    titleWrap.append(this._headerTitleEl, editTitleBtn);
    const acts = mk('div','header-actions');

    // sessions toggle
    const histBtn = ibtn(I.history, 'Session history');
    histBtn.onclick = () => this._toggleSessions();

    // model selector
    const modelSel = this._buildModelSel();

    // new session
    const newBtn = ibtn(I.newchat, 'New session (Ctrl+N)');
    newBtn.onclick = () => this._newSession();

    acts.append(histBtn, modelSel, newBtn);
    hdr.append(logo, titleWrap, acts);
    return hdr;
  }

  private _buildModelSel(): HTMLElement {
    const wrap = mk('div','model-sel');
    this._modelBtnEl = document.createElement('button');
    this._modelBtnEl.className = 'model-sel-btn';
    this._updateModelBtn();
    this._modelBtnEl.onclick = e => { e.stopPropagation(); this._toggleModelMenu(); };

    this._modelMenuEl = mk('div','model-menu hidden');
    const mhdr = mk('div','model-menu-hdr'); mhdr.textContent = 'Model';
    this._modelMenuEl.appendChild(mhdr);
    MODELS.forEach(m => {
      const item = mk('div',`model-item${m.id===this._model?' active':''}`);
      item.innerHTML = `<span class="model-item-check">${m.id===this._model?I.check:''}</span>
        <span class="model-item-info"><div class="model-item-name">${m.name}</div><div class="model-item-desc">${m.desc}</div></span>`;
      item.onclick = e => { e.stopPropagation(); this._model = m.id; this._updateModelBtn(); this._refreshModelMenu(); this._modelMenuEl.classList.add('hidden'); this._saveState(); this._vs.postMessage({type:'setModel',payload:m.id}); };
      this._modelMenuEl.appendChild(item);
    });
    wrap.append(this._modelBtnEl, this._modelMenuEl);
    return wrap;
  }

  private _updateModelBtn(): void {
    const m = MODELS.find(x => x.id === this._model) ?? MODELS[0];
    this._modelBtnEl.innerHTML = `${m.name} ${I.chevD}`;
  }
  private _refreshModelMenu(): void {
    this._modelMenuEl.querySelectorAll('.model-item').forEach((el,i) => {
      el.classList.toggle('active', MODELS[i].id === this._model);
      el.querySelector('.model-item-check')!.innerHTML = MODELS[i].id===this._model ? I.check : '';
    });
  }
  private _toggleModelMenu(): void {
    const isHidden = this._modelMenuEl.classList.contains('hidden');
    this._modeMenuEl?.classList.add('hidden');
    this._cmdMenuEl?.classList.add('hidden');
    if (!isHidden) { this._modelMenuEl.classList.add('hidden'); return; }
    this._positionOverlay(this._modelMenuEl, this._modelBtnEl, 'below-left');
    this._modelMenuEl.classList.remove('hidden');
  }

  // ─── Body ───────────────────────────────────────────────

  private _buildBody(): HTMLElement {
    const body = mk('div','body');
    this._sessPanel = this._buildSessPanel();
    body.append(this._sessPanel, this._buildChatArea());
    return body;
  }

  // ─── Sessions panel ────────────────────────────────────

  private _buildSessPanel(): HTMLElement {
    const panel = mk('div','sessions-panel closed');
    const hdr   = mk('div','sessions-header');
    const lbl   = mk('span','sessions-header-label'); lbl.textContent = 'Conversations';
    const closeBtn = ibtn('×', 'Close');
    (closeBtn as HTMLButtonElement).style.fontSize = '16px';
    closeBtn.onclick = () => this._toggleSessions();
    hdr.append(lbl, closeBtn);

    const search = mk('div','sessions-search');
    const sinput = document.createElement('input');
    sinput.placeholder = 'Search sessions…';
    sinput.oninput = () => this._renderSessions(sinput.value);
    search.appendChild(sinput);

    this._sessList = mk('div','sessions-list');

    const newBtn = document.createElement('button');
    newBtn.className = 'sessions-new'; newBtn.textContent = '+ New Session';
    newBtn.onclick = () => this._newSession();

    panel.append(hdr, search, this._sessList, newBtn);
    this._renderSessions('');
    return panel;
  }

  private _toggleSessions(): void {
    this._sessPanel.classList.toggle('closed');
  }

  private _renderSessions(filter: string): void {
    this._sessList.innerHTML = '';
    const all = this._sessions.filter(s => s.title.toLowerCase().includes(filter.toLowerCase()));
    if (!all.length) {
      const e = mk('div','msg-meta'); e.style.padding='16px'; e.textContent='No conversations yet';
      this._sessList.appendChild(e); return;
    }
    const groups: Record<string,Session[]> = {};
    const now = Date.now();
    all.forEach(s => {
      const diff = now - s.createdAt;
      const g = diff < 86400000 ? 'Today' : diff < 172800000 ? 'Yesterday' : diff < 604800000 ? 'Last 7 days' : 'Older';
      (groups[g] ??= []).push(s);
    });
    ['Today','Yesterday','Last 7 days','Older'].forEach(g => {
      if (!groups[g]) return;
      const lbl = mk('div','session-group-label'); lbl.textContent = g; this._sessList.appendChild(lbl);
      groups[g].forEach(s => {
        const item = mk('div',`session-item${s.id===this._curSessionId?' active':''}`);
        const icon = mk('span','session-item-icon'); icon.textContent = '💬';
        const body = mk('div','session-item-body');
        const name = mk('div','session-item-name'); name.textContent = s.title;
        const meta = mk('div','session-item-meta'); meta.textContent = fmtTime(s.createdAt);
        body.append(name, meta);
        const acts2 = mk('div','session-item-actions');
        const renBtn = ibtn(I.edit,'Rename');
        renBtn.onclick = e2 => { e2.stopPropagation(); const t = prompt('Rename session:',s.title); if(t){s.title=t.trim();this._renderSessions(filter);this._updateHeaderTitle();this._saveState();} };
        const delBtn = ibtn(I.trash,'Delete');
        delBtn.onclick = e2 => { e2.stopPropagation(); this._deleteSession(s.id); };
        acts2.append(renBtn, delBtn);
        item.append(icon, body, acts2);
        item.onclick = () => this._loadSession(s.id);
        this._sessList.appendChild(item);
      });
    });
  }

  // ─── Chat area ─────────────────────────────────────────

  private _buildChatArea(): HTMLElement {
    const area = mk('div','chat-area');
    this._chatAreaEl = area;
    this._msgsEl = mk('div','messages');
    this._permOverlayEl = mk('div','perm-overlay hidden');
    this._showEmpty();
    area.append(this._msgsEl, this._buildInputArea(), this._permOverlayEl);

    // Track whether user has manually scrolled away from bottom
    this._msgsEl.addEventListener('scroll', () => {
      const el = this._msgsEl;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
      this._userScrolledUp = !atBottom;
    }, { passive: true });

    return area;
  }

  private _showEmpty(): void {
    this._msgsEl.innerHTML = '';
    const s = mk('div','empty-state');
    const logo = mk('div','empty-logo'); logo.textContent = 'C';
    const t = mk('div','empty-title'); t.textContent = 'How can I help you?';
    const h = mk('div','empty-hint'); h.textContent = 'Ask anything. Use / for commands, @ to reference files.';
    s.append(logo,t,h); this._msgsEl.appendChild(s);
  }

  // ─── Input area ────────────────────────────────────────

  private _buildInputArea(): HTMLElement {
    const area = mk('div','input-area');

    // ctx-bar elements kept for updateContext() compatibility but not rendered
    this._ctxBarEl = mk('div','ctx-bar');
    this._ctxBarFill = mk('div','ctx-bar-fill');

    // Autocomplete
    this._acEl = mk('div','autocomplete hidden');

    // Command menu
    this._cmdMenuEl = this._buildCmdMenu();

    // Mode menu
    this._modeMenuEl = mk('div','mode-menu hidden');
    this._buildModeMenu();

    // Input box
    const box = mk('div','input-box');
    this._inputBoxEl = box;
    this._attachedEl = mk('div','attached-files');
    this._mentionEl  = mk('div','mention-chips');
    this._textareaEl = document.createElement('textarea');
    this._textareaEl.className = 'chat-textarea';
    this._textareaEl.placeholder = 'Message Claude… (/ for commands, @ for files)';
    this._textareaEl.rows = 1;
    this._textareaEl.oninput = () => this._onInput();
    this._textareaEl.onkeydown = e => this._onKeydown(e);

    // Selection indicator
    this._selectionIndicator = mk('div','input-footer-left');
    this._selectionIndicator.style.cssText = 'display:none;align-items:center;gap:4px;font-size:11px;opacity:.55;padding:0 12px 4px;';
    const eyeBtn = document.createElement('button');
    eyeBtn.style.cssText = 'background:none;border:none;cursor:pointer;color:inherit;padding:0;opacity:.7;display:flex;align-items:center;';
    eyeBtn.innerHTML = I.eye;
    eyeBtn.title = 'Toggle selection visibility';
    eyeBtn.onclick = () => {
      this._showSelection = !this._showSelection;
      eyeBtn.innerHTML = this._showSelection ? I.eye : I.eyeOff;
      this._vs.postMessage({type:'toggleSelection', payload:this._showSelection});
    };
    const selSpan = document.createElement('span');
    this._selectionIndicator.append(eyeBtn, selSpan);

    // Footer
    const footer = mk('div','input-footer');
    const left   = mk('div','input-footer-left');
    const right  = mk('div','input-footer-right');

    // Left: + dropdown, slash, compact (with pie), mic
    const addWrap = mk('div','add-btn-wrap');
    const addBtn = document.createElement('button');
    addBtn.className = 'fib'; addBtn.title = 'Add context'; addBtn.innerHTML = I.plus;
    this._addMenuEl = mk('div','add-menu hidden');
    this._buildAddMenu();
    addBtn.onclick = e => { e.stopPropagation(); this._toggleAddMenu(addBtn); };
    addWrap.append(addBtn);

    const slashBtn = document.createElement('button');
    slashBtn.className = 'fib'; slashBtn.title = 'Commands (/)'; slashBtn.innerHTML = I.slash;
    slashBtn.onclick = e => { e.stopPropagation(); this._openCmdMenu(); };

    // Compact button with pie chart + popup
    this._compactBtnEl = document.createElement('button');
    this._compactBtnEl.className = 'fib compact-btn';
    this._compactBtnEl.title = 'Compact conversation';
    this._compactPopupEl = mk('div','compact-popup hidden');
    const compactWrap = mk('div','compact-wrap');
    compactWrap.append(this._compactBtnEl);
    this._compactBtnEl.onclick = () => this._vs.postMessage({type:'compact'});
    this._compactBtnEl.onmouseenter = () => this._showCompactPopup(this._compactBtnEl);
    this._compactBtnEl.onmouseleave = () => this._compactPopupEl.classList.add('hidden');
    this._renderCompactBtn();

    left.append(addWrap, slashBtn, compactWrap);

    // Right: mode button, send button (NO static ctx-indicator)
    this._ctxIndicator = mk('span','ctx-indicator hidden'); // hidden, only used internally

    this._modeBtnEl = document.createElement('button');
    this._modeBtnEl.className = 'mode-btn';
    this._updateModeBtn();
    this._modeBtnEl.onclick = e => { e.stopPropagation(); this._toggleModeMenu(); };

    this._sendBtnEl = document.createElement('button');
    this._sendBtnEl.className = 'send-btn'; this._sendBtnEl.title = 'Send (Enter)';
    this._sendBtnEl.innerHTML = I.send;
    this._sendBtnEl.onclick = () => {
      const hasText = this._textareaEl.value.trim().length > 0 || this._attachments.length > 0;
      if (this._streaming && !hasText) { this._stopStream(); } else { this._send(); }
    };

    right.append(this._modeBtnEl, this._sendBtnEl);
    footer.append(left, right);

    // Drag & drop onto the textarea/box
    // Also listen on whole document so user doesn't have to aim precisely
    const onDragOver = (e: DragEvent) => { e.preventDefault(); box.classList.add('drag-over'); };
    const onDragLeave = (e: DragEvent) => {
      // Only remove if leaving the box entirely (not a child element)
      if (!box.contains(e.relatedTarget as Node)) box.classList.remove('drag-over');
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation(); box.classList.remove('drag-over');
      const dt = e.dataTransfer;
      if (!dt) return;

      // Try uri-list first (VS Code Explorer sets this with full file:// URIs)
      const uriList = dt.getData('text/uri-list');
      if (uriList && uriList.trim()) {
        uriList.split(/\r?\n/).filter(l => l && !l.startsWith('#')).forEach(uri => {
          const filePath = decodeURIComponent(uri.replace(/^file:\/\/\//, '').replace(/\//g, '\\'));
          this.addAttachedFile(filePath);
        });
        return;
      }

      // Fallback: read file content via FileReader and let extension write to temp
      const files = dt.files;
      if (files) {
        Array.from(files).forEach(f => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const fullPath = (f as any).path as string | undefined;
          if (fullPath) {
            this.addAttachedFile(fullPath);
          } else {
            const isText = f.type.startsWith('text/') || /\.(js|ts|json|md|txt|css|html|xml|yaml|yml|py|java|cs|cpp|c|h|sh|env|ini|toml|sql)$/i.test(f.name);
            const reader = new FileReader();
            if (isText) {
              reader.onload = () => {
                this._inlineFiles.push({ name: f.name, content: reader.result as string });
                this.addAttachedFile(`[inline:${f.name}]`);
              };
              reader.readAsText(f);
            } else {
              // Binary file — resize image if needed, write to temp, attach path
              const placeholder = `[pending:${f.name}]`;
              this.addAttachedFile(placeholder);
              const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
              const isImage = f.type.startsWith('image/') || ['png','jpg','jpeg','gif','webp','bmp'].includes(ext);
              const reader2 = new FileReader();
              reader2.onload = () => {
                const dataUrl = reader2.result as string;
                if (isImage) {
                  // Resize via canvas to reduce size
                  const img = new Image();
                  img.onload = () => {
                    const MAX = 1920;
                    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
                    const w = Math.round(img.width * scale);
                    const h = Math.round(img.height * scale);
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
                    const resized = canvas.toDataURL('image/jpeg', 0.85);
                    const jpgName = f.name.replace(/\.[^.]+$/, '.jpg');
                    this._vs.postMessage({ type: 'fileContent', payload: { name: jpgName, content: resized, binary: true } });
                  };
                  img.onerror = () => {
                    // Canvas resize failed — send original
                    this._vs.postMessage({ type: 'fileContent', payload: { name: f.name, content: dataUrl, binary: true } });
                  };
                  img.src = dataUrl;
                } else {
                  this._vs.postMessage({ type: 'fileContent', payload: { name: f.name, content: dataUrl, binary: true } });
                }
              };
              reader2.readAsDataURL(f);
            }
          }
        });
      }
    };

    box.addEventListener('dragover', onDragOver);
    box.addEventListener('dragleave', onDragLeave);
    box.addEventListener('drop', onDrop);
    // Also catch drops that miss the box but land in the chat area
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', onDrop);

    box.append(this._attachedEl, this._mentionEl, this._textareaEl, this._selectionIndicator, footer);
    area.append(this._acEl, box);
    return area;
  }

  // ─── Add context menu ──────────────────────────────────

  private _buildAddMenu(): void {
    this._addMenuEl.innerHTML = '';
    const items = [
      { id:'upload',  icon: I.paperclip, label:'Upload from computer', desc:'Attach files from your computer' },
      { id:'context', icon: I.folder,    label:'Add context',           desc:'Add files or folders to the conversation' },
      { id:'browser', icon: I.globe,     label:'Browse the web',        desc:'Add browser tabs to the conversation' },
    ];
    items.forEach(it => {
      const row = mk('div','add-menu-item');
      row.innerHTML = `<span class="add-menu-icon">${it.icon}</span>
        <span class="add-menu-info"><div class="add-menu-label">${it.label}</div><div class="add-menu-desc">${it.desc}</div></span>`;
      row.onclick = e => {
        e.stopPropagation();
        this._addMenuEl.classList.add('hidden');
        if (it.id === 'upload') { this._vs.postMessage({type:'pickFile'}); }
        else if (it.id === 'context') { this._insertAtCursor('@'); }
        else if (it.id === 'browser') { this._insertAtCursor('@browser:'); }
      };
      this._addMenuEl.appendChild(row);
    });
  }

  private _toggleAddMenu(anchor: HTMLElement): void {
    const isHidden = this._addMenuEl.classList.contains('hidden');
    this._cmdMenuEl?.classList.add('hidden');
    this._modeMenuEl?.classList.add('hidden');
    this._modelMenuEl?.classList.add('hidden');
    if (!isHidden) { this._addMenuEl.classList.add('hidden'); return; }
    this._positionOverlay(this._addMenuEl, anchor, 'above-left');
    this._addMenuEl.classList.remove('hidden');
  }

  private _positionOverlay(el: HTMLElement, anchor: HTMLElement, placement: 'above-left'|'above-right'|'below-left'|'below-right'): void {
    el.style.position = 'fixed';
    el.style.zIndex = '9999';
    const r = anchor.getBoundingClientRect();
    if (placement === 'above-left') {
      el.style.bottom = `${window.innerHeight - r.top + 6}px`;
      el.style.top = '';
      el.style.left = `${r.left}px`;
      el.style.right = '';
    } else if (placement === 'above-right') {
      el.style.bottom = `${window.innerHeight - r.top + 6}px`;
      el.style.top = '';
      el.style.right = `${window.innerWidth - r.right}px`;
      el.style.left = '';
    } else if (placement === 'below-left') {
      el.style.top = `${r.bottom + 6}px`;
      el.style.bottom = '';
      el.style.left = `${r.left}px`;
      el.style.right = '';
    } else {
      el.style.top = `${r.bottom + 6}px`;
      el.style.bottom = '';
      el.style.right = `${window.innerWidth - r.right}px`;
      el.style.left = '';
    }
  }

  private _insertAtCursor(text: string): void {
    const ta = this._textareaEl;
    const pos = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, pos) + text + ta.value.slice(pos);
    ta.selectionStart = ta.selectionEnd = pos + text.length;
    ta.dispatchEvent(new Event('input'));
    ta.focus();
  }

  // ─── Compact pie button ────────────────────────────────

  private _renderCompactBtn(): void {
    const pct = this._contextWindow > 0 ? Math.min(100, (this._usedTokens / this._contextWindow) * 100) : 0;
    if (pct === 0) {
      // No context data yet — show plain compact icon
      this._compactBtnEl.innerHTML = I.compact;
      this._compactBtnEl.title = 'Compact conversation';
      return;
    }
    // Show pie chart
    const r = 7, circ = 2 * Math.PI * r;
    const filled = (pct / 100) * circ;
    this._compactBtnEl.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 18 18">
        <circle cx="9" cy="9" r="${r}" fill="none" stroke="var(--border)" stroke-width="2.5"/>
        <circle cx="9" cy="9" r="${r}" fill="none" stroke="var(--cc-orange)" stroke-width="2.5"
          stroke-dasharray="${filled} ${circ - filled}"
          stroke-dashoffset="${circ * 0.25}" stroke-linecap="round"/>
      </svg>`;
    this._compactBtnEl.title = `${Math.round(pct)}% context used — click to compact`;
  }

  private _showCompactPopup(anchor: HTMLElement): void {
    const pct = this._contextWindow > 0 ? Math.min(100, (this._usedTokens / this._contextWindow) * 100) : 0;
    const used = Math.round(pct);
    const label = `${used}% context used — click to compact`;
    this._compactPopupEl.innerHTML = `<div class="compact-popup-text">${label}</div>`;
    this._positionOverlay(this._compactPopupEl, anchor, 'above-left');
    this._compactPopupEl.classList.remove('hidden');
  }

  // ─── Command menu ───────────────────────────────────────

  private _buildCmdMenu(): HTMLElement {
    const menu = mk('div','cmd-menu hidden');
    const hdr = mk('div','cmd-menu-header');
    hdr.innerHTML = `<span>Commands</span><span style="opacity:.4;font-size:10px;font-weight:400">Esc to close</span>`;
    const search = document.createElement('input');
    search.className = 'cmd-menu-search'; search.placeholder = 'Search commands…';
    search.oninput = () => this._renderCmdMenu(search.value);
    search.onkeydown = e => {
      if (e.key==='ArrowDown'){e.preventDefault();this._moveCmdIdx(1);}
      if (e.key==='ArrowUp'){e.preventDefault();this._moveCmdIdx(-1);}
      if (e.key==='Enter'){e.preventDefault();this._confirmCmd();}
      if (e.key==='Escape'){e.preventDefault();menu.classList.add('hidden');}
    };
    menu.append(hdr, search);
    const body = mk('div','cmd-menu-body'); menu.appendChild(body);
    return menu;
  }

  private _openCmdMenu(): void {
    if (!this._cmdMenuEl.classList.contains('hidden')) {
      this._cmdMenuEl.classList.add('hidden'); return;
    }
    const search = this._cmdMenuEl.querySelector('input')!;
    search.value = '';
    this._renderCmdMenu('');
    this._positionOverlay(this._cmdMenuEl, this._textareaEl, 'above-left');
    this._cmdMenuEl.classList.remove('hidden');
    requestAnimationFrame(() => search.focus());
    this._acEl.classList.add('hidden');
    this._modeMenuEl.classList.add('hidden');
  }

  private _renderCmdMenu(filter: string): void {
    const body = this._cmdMenuEl.querySelector('.cmd-menu-body') as HTMLElement;
    body.innerHTML = '';
    this._cmdItems = COMMANDS.filter(c =>
      c.label.toLowerCase().includes(filter.toLowerCase()) ||
      c.desc.toLowerCase().includes(filter.toLowerCase())
    );
    this._cmdIdx = 0;
    const sections: Record<string,typeof COMMANDS> = {};
    this._cmdItems.forEach(c => (sections[c.section] ??= []).push(c));
    Object.entries(sections).forEach(([sec, cmds]) => {
      const lbl = mk('div','cmd-section-title'); lbl.textContent = sec; body.appendChild(lbl);
      cmds.forEach((c,i) => {
        const item = mk('div',`cmd-item${i===0&&sec===Object.keys(sections)[0]?' sel':''}`);
        item.dataset.cmdId = c.id;
        item.innerHTML = `<span class="cmd-item-main"><div class="cmd-item-name">${c.label}</div><div class="cmd-item-desc">${c.desc}</div></span>`;
        item.onclick = () => { this._runCmd(c.id); this._cmdMenuEl.classList.add('hidden'); };
        body.appendChild(item);
      });
    });
  }

  private _moveCmdIdx(d: number): void {
    const items = this._cmdMenuEl.querySelectorAll('.cmd-item');
    items[this._cmdIdx]?.classList.remove('sel');
    this._cmdIdx = Math.max(0, Math.min(this._cmdItems.length-1, this._cmdIdx+d));
    items[this._cmdIdx]?.classList.add('sel');
    items[this._cmdIdx]?.scrollIntoView({block:'nearest'});
  }

  private _confirmCmd(): void {
    const item = this._cmdItems[this._cmdIdx];
    if (item) { this._runCmd(item.id); this._cmdMenuEl.classList.add('hidden'); }
  }

  private _runCmd(id: string): void {
    if (id === 'model') { this._toggleModelMenu(); return; }
    if (id === 'thinking') {
      this._thinkingOn = !this._thinkingOn;
      this._saveState();
      this._vs.postMessage({type:'setThinking', payload:this._thinkingOn});
      this._appendMeta(`Extended thinking: ${this._thinkingOn ? 'ON' : 'OFF'}`);
      return;
    }
    if (id === 'clear') {
      this._clearSession(); return;
    }
    if (id === 'memory') {
      this._showMemoryPanel(); return;
    }
    if (id === 'compact') {
      this._vs.postMessage({type:'compact'});
      return;
    }
    if (id === 'security-review') {
      this._textareaEl.value =
        'Please perform a thorough security review of this project. ' +
        'For each finding include: file path, line number, severity (Critical/High/Medium/Low), description, and a concrete fix. ' +
        'Cover injection vulnerabilities, path traversal, XSS, insecure file ops, unvalidated input, secrets in code, and OWASP Top 10 relevant issues.';
      this._send();
      return;
    }
    this._vs.postMessage({type:'runCommand', payload: id});
    const cmd = COMMANDS.find(c => c.id === id);
    if (cmd) this._appendMeta(`Running ${cmd.label}…`);
  }

  private _showMemoryPanel(): void {
    if (!this._memory || !this._memory.entries.length) {
      this._appendMeta('No memory entries found.');
      return;
    }
    const w = mk('div','msg-wrap');
    const card = mk('div','memory-panel');
    const hdr = mk('div','memory-panel-hdr'); hdr.textContent = `Memory (${this._memory.entries.length} entries)`;
    card.appendChild(hdr);
    this._memory.entries.forEach(entry => {
      const row = mk('div','memory-entry');
      const badge = mk('span',`memory-type memory-type-${entry.type}`); badge.textContent = entry.type;
      const name = mk('span','memory-entry-name'); name.textContent = entry.name;
      const desc = mk('div','memory-entry-desc'); desc.textContent = entry.description;
      row.append(badge, name, desc);
      card.appendChild(row);
    });
    w.appendChild(card);
    this._msgsEl.appendChild(w); this._scroll();
  }

  // ─── Mode ──────────────────────────────────────────────

  private _buildModeMenu(): void {
    this._modeMenuEl.innerHTML = '';

    // Permission mode section
    const hdr = mk('div','mode-menu-hdr'); hdr.textContent = 'Modes';
    this._modeMenuEl.appendChild(hdr);
    MODES.forEach(m => {
      const item = mk('div',`mode-item${m.id===this._mode?' active':''}`);
      item.innerHTML = `<span class="mode-item-icon">${I[m.iconKey]}</span>
        <span class="mode-item-info"><div class="mode-item-name">${m.label}</div><div class="mode-item-desc">${m.desc}</div></span>
        <span class="mode-item-check">${m.id===this._mode?I.check:''}</span>`;
      item.onmousedown = e => { e.preventDefault(); this._mode=m.id; this._updateModeBtn(); this._buildModeMenu(); this._modeMenuEl.classList.add('hidden'); this._saveState(); this._vs.postMessage({type:'setMode',payload:m.id}); };
      this._modeMenuEl.appendChild(item);
    });

    // Effort section — slider style like Claude Code
    const effortRow = mk('div','effort-row');
    const effortLabel = mk('div','effort-label');
    const effortName = mk('span','effort-name'); effortName.textContent = 'Effort';
    const effortVal = mk('span','effort-val');
    const effortLevels: Array<'low'|'medium'|'high'|'max'> = ['low','medium','high','max'];
    const effortCapitalized = this._effort.charAt(0).toUpperCase() + this._effort.slice(1);
    effortVal.textContent = `(${effortCapitalized})`;
    effortLabel.append(effortName, effortVal);

    const sliderWrap = mk('div','effort-slider-wrap');
    const track = mk('div','effort-track');
    effortLevels.forEach(level => {
      const stop = mk('div', `effort-stop${this._effort === level ? ' active' : ''}`);
      stop.onmousedown = ev => {
        ev.preventDefault();
        this._effort = level;
        this._buildModeMenu();
        this._saveState();
        this._vs.postMessage({ type: 'setEffort', payload: level });
      };
      track.appendChild(stop);
    });
    sliderWrap.appendChild(track);
    effortRow.append(effortLabel, sliderWrap);
    this._modeMenuEl.appendChild(effortRow);

    // Thinking toggle row
    const thinkRow = mk('div','effort-row');
    thinkRow.style.cssText = 'cursor:pointer;';
    thinkRow.onclick = () => {
      this._thinkingOn = !this._thinkingOn;
      this._buildModeMenu();
      this._saveState();
      this._vs.postMessage({ type: 'setThinking', payload: this._thinkingOn });
    };
    const thinkLabel = mk('div','effort-label');
    const thinkName = mk('span','effort-name'); thinkName.textContent = 'Extended Thinking';
    const thinkToggle = mk('div', `think-toggle${this._thinkingOn ? ' on' : ''}`);
    thinkToggle.innerHTML = `<div class="think-thumb"></div>`;
    thinkLabel.append(thinkName);
    thinkRow.append(thinkLabel, thinkToggle);
    this._modeMenuEl.appendChild(thinkRow);
  }

  private _updateModeBtn(): void {
    const m = MODES.find(x => x.id === this._mode) ?? MODES[0];
    this._modeBtnEl.innerHTML = `${I[m.iconKey]} <span>${m.label}</span>`;
    this._modeBtnEl.className = `mode-btn${m.id==='bypassPermissions'?' danger':''}`;
    this._modeBtnEl.title = `${m.desc}. Click to change, Shift+Tab to cycle.`;
  }

  private _toggleModeMenu(): void {
    const isHidden = this._modeMenuEl.classList.contains('hidden');
    this._modelMenuEl?.classList.add('hidden');
    this._cmdMenuEl?.classList.add('hidden');
    this._acEl?.classList.add('hidden');
    if (!isHidden) { this._modeMenuEl.classList.add('hidden'); return; }
    this._positionOverlay(this._modeMenuEl, this._modeBtnEl, 'above-right');
    this._modeMenuEl.classList.remove('hidden');
  }

  private _cycleMode(): void {
    const idx = MODES.findIndex(m => m.id===this._mode);
    this._mode = MODES[(idx+1)%MODES.length].id;
    this._updateModeBtn(); this._buildModeMenu(); this._saveState();
    this._vs.postMessage({type:'setMode',payload:this._mode});
    this._appendMeta(`Mode: ${MODES.find(m=>m.id===this._mode)!.label}`);
  }

  // ─── Input handling ────────────────────────────────────

  private _onInput(): void {
    // auto-resize
    this._textareaEl.style.height = 'auto';
    this._textareaEl.style.height = Math.min(this._textareaEl.scrollHeight,180)+'px';
    this._updateSendBtn();

    const val = this._textareaEl.value;
    const pos = this._textareaEl.selectionStart ?? val.length;
    const before = val.slice(0,pos);

    // /command popup
    const slashM = before.match(/(^|\n)(\/\S*)$/);
    if (slashM) {
      const q = slashM[2].slice(1).toLowerCase();
      if (q === '') { this._openCmdMenu(); return; }
      this._cmdMenuEl.classList.add('hidden');
      this._showSkillAc(q); return;
    }

    // @-mention
    const atM = before.match(/@(\S*)$/);
    if (atM) {
      this._vs.postMessage({type:'getWorkspaceFiles', payload: atM[1]});
      this._cmdMenuEl.classList.add('hidden');
      return;
    }

    this._hideAc();
  }

  private _onKeydown(e: KeyboardEvent): void {
    // Autocomplete nav
    if (!this._acEl.classList.contains('hidden')) {
      if (e.key==='ArrowDown'){e.preventDefault();this._moveAc(1);return;}
      if (e.key==='ArrowUp'){e.preventDefault();this._moveAc(-1);return;}
      if (e.key==='Tab'||e.key==='Enter'){e.preventDefault();this._confirmAc();return;}
      if (e.key==='Escape'){e.preventDefault();this._hideAc();return;}
    }
    if (e.key==='Tab'&&e.shiftKey){e.preventDefault();this._cycleMode();return;}
    const sendKey = this._ctrlEnterToSend ? (e.key==='Enter'&&(e.ctrlKey||e.metaKey)) : (e.key==='Enter'&&!e.shiftKey);
    if (sendKey){e.preventDefault();this._send();return;}
  }

  // ─── Autocomplete (skill) ──────────────────────────────

  private _showSkillAc(q: string): void {
    const cmdMatches = COMMANDS.filter(c =>
      c.id.startsWith(q) || c.label.toLowerCase().includes(q)
    ).map(c => ({label:c.label, desc:c.desc, value:c.id, icon:'/', type:'cmd'}));

    const skillMatches = this._skills.filter(s =>
      s.name.toLowerCase().startsWith(q) || s.description.toLowerCase().includes(q)
    ).slice(0,10).map(s => ({label:`/${s.name}`,desc:s.description,value:`/${s.name} `,icon:'/',type:'skill'}));

    const matches = [...cmdMatches, ...skillMatches];
    if (!matches.length){ this._hideAc(); return; }
    this._acItems = matches; this._acIdx = 0;
    this._acEl.innerHTML = '';

    if (cmdMatches.length) {
      const hdr = mk('div','ac-section'); hdr.textContent = 'Commands';
      this._acEl.appendChild(hdr);
    }
    matches.forEach((m,i) => {
      const row = mk('div',`ac-item${i===0?' sel':''}`);
      row.innerHTML = `<span class="ac-main"><div class="ac-name">${esc(m.label)}</div><div class="ac-desc">${esc(m.desc)}</div></span>`;
      row.onmousedown = e2 => { e2.preventDefault(); this._acIdx=i; this._confirmAc(); };
      if (i === cmdMatches.length && skillMatches.length) {
        const hdr2 = mk('div','ac-section'); hdr2.textContent = 'Skills';
        this._acEl.appendChild(hdr2);
      }
      this._acEl.appendChild(row);
    });
    this._acEl.classList.remove('hidden');
  }

  showFileAc(files: string[]): void {
    this._acItems = files.slice(0,12).map(f=>({label:`@${f}`,desc:'',value:f,icon:'@',type:'file'}));
    this._acIdx = 0;
    this._acEl.innerHTML = '';
    const hdr = mk('div','ac-section'); hdr.textContent = 'Files';
    this._acEl.appendChild(hdr);
    this._acItems.forEach((m,i) => {
      const row = mk('div',`ac-item${i===0?' sel':''}`);
      row.innerHTML = `<span class="ac-main"><div class="ac-name">${esc(m.label)}</div></span>`;
      row.onmousedown = e2 => { e2.preventDefault(); this._acIdx=i; this._confirmAc(); };
      this._acEl.appendChild(row);
    });
    this._acEl.classList.remove('hidden');
  }

  private _hideAc(): void {
    this._acEl.classList.add('hidden');
    this._acItems = []; this._acIdx = 0;
  }

  private _moveAc(d: number): void {
    const rows = this._acEl.querySelectorAll('.ac-item');
    rows[this._acIdx]?.classList.remove('sel');
    this._acIdx = Math.max(0,Math.min(this._acItems.length-1,this._acIdx+d));
    rows[this._acIdx]?.classList.add('sel');
    rows[this._acIdx]?.scrollIntoView({block:'nearest'});
  }

  private _confirmAc(): void {
    const item = this._acItems[this._acIdx]; if(!item) return;
    if (item.type === 'cmd') {
      this._hideAc();
      const val = this._textareaEl.value;
      const pos = this._textareaEl.selectionStart ?? val.length;
      const before = val.slice(0, pos);
      this._textareaEl.value = before.replace(/(^|\n)\/\S*$/, '$1') + val.slice(pos);
      this._textareaEl.dispatchEvent(new Event('input'));
      this._runCmd(item.value);
      this._textareaEl.focus();
      return;
    }
    const val = this._textareaEl.value;
    const pos = this._textareaEl.selectionStart ?? val.length;
    const before = val.slice(0,pos);
    if (item.type==='skill') {
      this._textareaEl.value = before.replace(/(^|\n)\/\S*$/,`$1${item.value}`) + val.slice(pos);
    } else {
      this._textareaEl.value = before.replace(/@\S*$/,'') + val.slice(pos);
      this._addMention(item.value);
    }
    this._textareaEl.dispatchEvent(new Event('input'));
    this._hideAc(); this._textareaEl.focus();
  }

  private _addMention(f: string): void {
    if (this._mentions.includes(f)) return;
    this._mentions.push(f);
    const chip = mk('span','mention-chip');
    chip.innerHTML = `@${esc(f)} <button class="mention-chip-x">×</button>`;
    chip.querySelector('button')!.onclick = () => { this._mentions=this._mentions.filter(x=>x!==f); chip.remove(); };
    this._mentionEl.appendChild(chip);
  }

  // ─── Send ───────────────────────────────────────────────

  private _send(): void {
    const text = this._textareaEl.value.trim();
    if (!text && !this._attachments.length) return;

    if (this._attachments.some(f => f.startsWith('[pending:'))) return; // wait for binary upload

    const parts: string[] = [];
    const regularFiles = [...this._attachments.filter(f => !f.startsWith('[inline:') && !f.startsWith('[pending:')), ...this._mentions];
    if (regularFiles.length) parts.push(`[Files: ${regularFiles.join(', ')}]`);
    for (const f of this._inlineFiles) {
      parts.push(`\n<file name="${f.name}">\n${f.content}\n</file>`);
    }
    if (this._thinkingOn) parts.push('[Extended thinking: on]');
    parts.push(text);
    const fullText = parts.join('\n');

    this._ensureSession();
    this._appendUser(text, [...this._attachments]);
    this._storeMsg('user', text, [...this._attachments]);
    this._textareaEl.value = ''; this._textareaEl.style.height = 'auto';
    this._attachments = []; this._mentions = []; this._inlineFiles = [];
    this._attachedEl.innerHTML = ''; this._mentionEl.innerHTML = '';
    this._hideAc(); this._cmdMenuEl.classList.add('hidden');
    this._updateSendBtn();

    if (this._streaming) {
      this._pendingQueue.push({text: fullText, model: this._model, mode: this._mode});
      return;
    }

    this._startAssist();
    this._vs.postMessage({type:'sendMessage',payload:{text:fullText,model:this._model,mode:this._mode}});
  }

  private _stopStream(): void {
    this._vs.postMessage({type:'stopStreaming'});
  }

  private _rewindFrom(msgWrap: HTMLElement): void {
    // Remove all messages after this wrap element
    const allWraps = Array.from(this._msgsEl.querySelectorAll('.msg-wrap'));
    const idx = allWraps.indexOf(msgWrap);
    if (idx < 0) return;
    // Keep messages up to (not including) this one
    allWraps.slice(idx).forEach(el => el.remove());
    // Also truncate stored session messages
    const s = this._sessions.find(x => x.id === this._curSessionId);
    if (s) {
      s.msgs = s.msgs.slice(0, idx);
      this._saveState();
    }
    this._curAssistBody = null;
    this._streaming = false;
    this._updateSendBtn();
    this._vs.postMessage({ type: 'rewind', payload: { index: idx } });
    if (this._msgsEl.children.length === 0) this._showEmpty();
  }

  // ─── Messages ───────────────────────────────────────────

  private _appendUser(text: string, atts: string[]): void {
    this._msgsEl.querySelector('.empty-state')?.remove();
    const w = mk('div','msg-wrap user');
    const msgId = `msg_${++this._msgCounter}`;
    w.dataset.msgId = msgId;

    const rw = document.createElement('button'); rw.className = 'rewind-btn'; rw.title = 'Rewind from here';
    rw.innerHTML = I.rewind; rw.onclick = () => this._rewindFrom(w);
    w.appendChild(rw);
    if (atts.length) {
      const c = mk('div','user-attachments');
      atts.forEach(f => { const ch=mk('span','attachment-chip'); ch.textContent=`📄 ${f}`; c.appendChild(ch); });
      w.appendChild(c);
    }
    const b = mk('div','user-bubble'); b.textContent = text;
    w.appendChild(b);
    this._msgsEl.appendChild(w); this._scroll();
  }

  private _startAssist(): void {
    this._streaming = true;
    this._userScrolledUp = false;
    this._pendingTools.clear();
    this._updateSendBtn();
    this._curThinking = null; this._toolBlocks.clear();

    const w = mk('div','msg-wrap assistant');
    const msgId = `msg_${++this._msgCounter}`;
    w.dataset.msgId = msgId;
    const row = mk('div','assistant-row');
    const av  = mk('div','avatar'); av.textContent = 'C';
    const body = mk('div','assistant-body');
    const dots = mk('div','loading-dots');
    dots.innerHTML = '<span></span><span></span><span></span>';
    body.appendChild(dots);
    const rw = document.createElement('button'); rw.className = 'rewind-btn'; rw.title = 'Rewind from here';
    rw.innerHTML = I.rewind; rw.onclick = () => this._rewindFrom(w);
    w.appendChild(rw);
    row.append(av, body); w.appendChild(row);
    this._msgsEl.appendChild(w);
    this._curAssistBody = body;

    // Create status label inside the message bubble, at the bottom
    this._statusEl = this._makeStatusEl();
    body.appendChild(this._statusEl);
    this._startStatusAnim();

    this._scroll();
  }

  private _appendMeta(txt: string): void {
    const m = mk('div','msg-meta'); m.textContent = txt;
    this._msgsEl.appendChild(m); this._scroll();
  }

  // ─── Markdown rendering ─────────────────────────────────

  private _renderMdInto(el: HTMLElement, raw: string): void {
    const specials = Array.from(el.children).filter(c =>
      c.classList.contains('thinking-block') || c.classList.contains('tool-block')
    );
    el.innerHTML = '';
    specials.forEach(c => el.appendChild(c));
    const div = mk('div','md-content');
    div.innerHTML = this._parseMd(raw);
    div.querySelectorAll('pre > code').forEach(code => {
      const lang = code.className.replace('language-','') || 'code';
      code.parentElement!.replaceWith(this._codeBlock(lang, code.textContent ?? ''));
    });
    this._linkifyFilePaths(div);
    el.appendChild(div);
  }

  // Regex: Windows absolute paths like C:\foo\bar.txt or /unix/path/file.ext
  private static readonly _PATH_RE = /([A-Za-z]:[\\\/][^\s"'<>`,;，。、]+|\/(?:home|usr|var|tmp|etc|opt|root|mnt)[^\s"'<>`,;，。、]*)/g;

  private _linkifyFilePaths(root: HTMLElement): void {
    const re = ChatUI._PATH_RE;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        let p = node.parentElement;
        while (p && p !== root) {
          if (p.tagName === 'CODE' || p.tagName === 'PRE' || p.classList.contains('file-link')) return NodeFilter.FILTER_REJECT;
          p = p.parentElement;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes: Text[] = [];
    let n: Node | null;
    while ((n = walker.nextNode())) nodes.push(n as Text);

    for (const textNode of nodes) {
      const text = textNode.textContent ?? '';
      re.lastIndex = 0;
      if (!re.test(text)) continue;
      re.lastIndex = 0;

      const frag = document.createDocumentFragment();
      let last = 0, m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
        const span = document.createElement('span');
        span.className = 'file-link';
        span.title = 'Click to open file';
        span.textContent = m[0];
        span.dataset.path = m[0];
        const path = m[0];
        span.onclick = () => this._vs.postMessage({ type: 'openFile', payload: path });
        frag.appendChild(span);
        last = m.index + m[0].length;
      }
      if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
      textNode.parentNode?.replaceChild(frag, textNode);
    }
  }

  private _parseMd(raw: string): string {
    try { return marked.parse(raw) as string; } catch { return `<p>${esc(raw)}</p>`; }
  }

  private _codeBlock(lang: string, code: string): HTMLElement {
    const wrap = mk('div','code-block');
    const hdr  = mk('div','code-block-header');
    const lbl  = mk('span','code-block-lang'); lbl.textContent = lang;
    const copy = document.createElement('button'); copy.className='code-copy'; copy.textContent='Copy';
    copy.onclick = () => { navigator.clipboard?.writeText(code).then(()=>{ copy.textContent='Copied!'; setTimeout(()=>{copy.textContent='Copy';},1500); }); };
    hdr.append(lbl, copy);
    const pre = document.createElement('pre');
    const el  = document.createElement('code'); el.textContent = code; pre.appendChild(el);
    wrap.append(hdr, pre); return wrap;
  }

  // ─── Sessions persistence ───────────────────────────────

  private _ensureSession(): void {
    if (this._curSessionId) return;
    const id = `s_${Date.now()}`;
    this._sessions.unshift({id, title:'New Session', msgs:[], createdAt:Date.now()});
    this._curSessionId = id;
    this._saveState(); this._renderSessions('');
  }

  private _storeMsg(role: StoredMsg['role'], content: string, attachments?: string[]): void {
    const s = this._sessions.find(x => x.id === this._curSessionId); if(!s) return;
    s.msgs.push({role, content, attachments});
    if (s.title === 'New Session' && role === 'user') {
      const trimmed = content.trim();
      if (trimmed) s.title = trimmed.slice(0,55) + (trimmed.length>55 ? '…' : '');
      this._updateHeaderTitle();
    }
    this._saveState(); this._renderSessions('');
    // Sync to extension so it persists across reloads
    this._vs.postMessage({ type: 'saveSession', payload: s });
  }

  private _newSession(): void {
    // Just ask extension to open a new panel — don't clear this panel's content
    this._vs.postMessage({type:'newSession'});
  }

  private _clearSession(): void {
    this._vs.postMessage({type:'newConversation'});
    this._curSessionId = null; this._streaming = false;
    this._updateSendBtn();
    this._curAssistBody = null; this._curThinking = null;
    this._toolBlocks.clear(); this._msgCounter = 0;
    this._showEmpty(); this.updateContext(0);
    this._ensureSession();
    this._updateHeaderTitle();
    this._saveState(); this._renderSessions('');
  }

  private _loadSession(id: string): void {
    const s = this._sessions.find(x => x.id === id); if(!s) return;
    this._curSessionId = id;
    this._msgsEl.innerHTML = '';
    if (!s.msgs.length) { this._showEmpty(); return; }

    // Group system(tools) + assistant pairs into one bubble
    let i = 0;
    while (i < s.msgs.length) {
      const m = s.msgs[i];
      if (m.role === 'user') {
        this._appendUser(m.content, m.attachments ?? []);
        i++;
      } else if (m.role === 'system') {
        // system msg may be followed by assistant msg — render together
        const w = mk('div','msg-wrap assistant');
        const row = mk('div','assistant-row');
        const av = mk('div','avatar'); av.textContent = 'C';
        const body = mk('div','assistant-body');
        // Render tool blocks
        try {
          const data = JSON.parse(m.content) as { tools?: StoredTool[] };
          if (Array.isArray(data.tools)) {
            data.tools.forEach(t => {
              const { icon, label, detail } = _toolMeta(t.name, t.input);
              const block = document.createElement('details') as HTMLDetailsElement;
              block.className = 'tool-block';
              block.open = false;
              const statusCls = t.status === 'denied' || t.status === 'error' ? 'denied' : 'done';
              const bodyHtml = t.diff ? _renderDiff(t.diff) : (t.result !== undefined ? _formatToolResult(t.name, t.result) : '');
              block.innerHTML = `
                <summary class="tool-summary">
                  <span class="tool-chevron">${I.chevD}</span>
                  <span class="tool-icon-wrap">${icon}</span>
                  <span class="tool-label">${esc(label)}</span>
                  <span class="tool-detail">${esc(detail)}</span>
                  <span class="tool-status ${statusCls}"></span>
                </summary>
                <div class="tool-body">${bodyHtml}</div>`;
              body.appendChild(block);
            });
          }
        } catch { /* not tool data, skip */ }
        // Check if next msg is the assistant text for this turn
        const next = s.msgs[i + 1];
        if (next?.role === 'assistant') {
          this._renderMdInto(body, next.content);
          i += 2;
        } else {
          i++;
        }
        row.append(av, body); w.appendChild(row); this._msgsEl.appendChild(w);
      } else if (m.role === 'assistant') {
        const w = mk('div','msg-wrap assistant');
        const row = mk('div','assistant-row');
        const av = mk('div','avatar'); av.textContent = 'C';
        const body = mk('div','assistant-body');
        this._renderMdInto(body, m.content);
        row.append(av, body); w.appendChild(row); this._msgsEl.appendChild(w);
        i++;
      } else {
        i++;
      }
    }
    this._renderSessions(''); this._scroll();
  }

  private _deleteSession(id: string): void {
    this._sessions = this._sessions.filter(s => s.id !== id);
    if (this._curSessionId === id) this._newSession();
    else { this._saveState(); this._renderSessions(''); }
  }

  // ─── State ─────────────────────────────────────────────

  private _saveState(): void {
    try {
      this._vs.setState({
        sessions: this._sessions.slice(0,100),
        curSessionId: this._curSessionId,
        model: this._model,
        mode:  this._mode,
        effort: this._effort,
        thinkingOn: this._thinkingOn,
      });
    } catch { /* ignore */ }
  }

  private _loadState(): void {
    try {
      const st = this._vs.getState() as Record<string,unknown>|null;
      if (!st) return;
      this._sessions      = (st['sessions'] as Session[]) ?? [];
      this._curSessionId  = (st['curSessionId'] as string) ?? null;
      this._model         = (st['model'] as string) ?? MODELS[0].id;
      this._mode          = (st['mode']  as string) ?? MODES[0].id;
      this._effort        = (st['effort'] as 'low'|'medium'|'high'|'max') ?? 'medium';
      this._thinkingOn    = (st['thinkingOn'] as boolean) ?? false;
    } catch { /* ignore */ }
  }

  private _scroll(): void {
    if (this._userScrolledUp) return;
    requestAnimationFrame(() => { this._msgsEl.scrollTop = this._msgsEl.scrollHeight; });
  }

  // ─── Status animation ──────────────────────────────────

  private static readonly _STATUS_PHRASES = [
    'Thinking…', 'Synthesizing…', 'Channeling…', 'Cogitating…',
    'Ruminating…', 'Discombolulating…', 'Contemplating…', 'Deliberating…',
    'Pondering…', 'Analyzing…', 'Reasoning…', 'Processing…',
  ];

  private _makeStatusEl(): HTMLElement {
    const el = mk('div', 'ai-status');
    const textSpan = mk('span', 'ai-status-text');
    const cursor = mk('span', 'ai-status-cursor');
    el.appendChild(textSpan);
    el.appendChild(cursor);
    // After slide-in completes, lock opacity and disable animation so re-appending
    // the element (to keep it pinned at bottom) does not restart the animation.
    el.addEventListener('animationend', () => {
      el.style.opacity = '1';
      el.style.animation = 'none';
    }, { once: true });
    return el;
  }

  private _startStatusAnim(): void {
    const phrases = ChatUI._STATUS_PHRASES;
    this._statusTypeIdx = Math.floor(Math.random() * phrases.length);
    this._statusCharIdx = 0;
    this._statusErasing = false;

    const textSpan = (): HTMLElement | null =>
      this._statusEl?.querySelector('.ai-status-text') ?? null;

    const tick = () => {
      if (!this._statusEl?.isConnected) return;
      const span = textSpan();
      if (!span) return;
      const phrase = phrases[this._statusTypeIdx];

      if (!this._statusErasing) {
        // Typing forward
        this._statusCharIdx++;
        span.textContent = phrase.slice(0, this._statusCharIdx);
        if (this._statusCharIdx >= phrase.length) {
          // Finished typing — pause then erase
          this._statusTimer = setTimeout(() => {
            this._statusErasing = true;
            tick();
          }, 1800);
          return;
        }
        this._statusTimer = setTimeout(tick, 45 + Math.random() * 25);
      } else {
        // Erasing backward
        this._statusCharIdx--;
        span.textContent = phrase.slice(0, this._statusCharIdx);
        if (this._statusCharIdx <= 0) {
          // Pick next phrase and start typing
          this._statusErasing = false;
          this._statusTypeIdx = (this._statusTypeIdx + 1) % phrases.length;
          this._statusTimer = setTimeout(tick, 120);
          return;
        }
        this._statusTimer = setTimeout(tick, 28 + Math.random() * 18);
      }
    };

    this._statusTimer = setTimeout(tick, 80);
  }

  private _stopStatusAnim(): void {
    if (this._statusTimer !== undefined) {
      clearTimeout(this._statusTimer);
      this._statusTimer = undefined;
    }
    this._statusEl?.remove();
  }
}

// ─── Helpers ──────────────────────────────────────────────

function mk(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag); e.className = cls; return e;
}
function ibtn(html: string, title: string): HTMLButtonElement {
  const b = document.createElement('button'); b.className='ibtn'; b.title=title; b.innerHTML=html; return b;
}
function esc(s: string): string {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function fmtTime(ts: number): string {
  const d = new Date(ts), now = Date.now(), diff = (now-ts)/1000;
  if (diff<60) return 'just now';
  if (diff<3600) return `${Math.floor(diff/60)}m ago`;
  if (diff<86400) return `${Math.floor(diff/3600)}h ago`;
  return d.toLocaleDateString();
}

// ─── Tool display helpers ─────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  Read:    `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2h6l4 4v8H4V2z"/><path d="M10 2v4h4"/><path d="M6 9h5M6 12h3"/></svg>`,
  Write:   `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2.5l2.5 2.5L5 13.5H2.5V11L11 2.5z"/></svg>`,
  Edit:    `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M11 2.5l2.5 2.5L5 13.5H2.5V11L11 2.5z"/><path d="M9 4.5l2.5 2.5"/></svg>`,
  Bash:    `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 7l2 2-2 2M9 11h3"/></svg>`,
  Glob:    `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M13 13l-2.5-2.5"/></svg>`,
  Grep:    `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M13 13l-2.5-2.5"/><path d="M5 7h4"/></svg>`,
  Agent:   `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="6" r="3"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5"/></svg>`,
  Fetch:   `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M2 8h12M8 2c-2 2-3 4-3 6s1 4 3 6M8 2c2 2 3 4 3 6s-1 4-3 6"/></svg>`,
  Search:  `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="7" cy="7" r="4.5"/><path d="M13 13l-2.5-2.5"/></svg>`,
  Todo:    `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="2" width="10" height="12" rx="1"/><path d="M6 6h5M6 9h5M6 12h3"/></svg>`,
  Default: `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 5v3l2 1.5"/></svg>`,
};

function _toolMeta(name: string, input?: Record<string,unknown>): { icon: string; label: string; detail: string; filePath?: string } {
  const i = input ?? {};
  switch (name) {
    case 'Read': case 'read_file': {
      const fp = (i['file_path'] as string) ?? (i['path'] as string) ?? '';
      const offset = i['offset'] as number | undefined;
      const limit = i['limit'] as number | undefined;
      const lineInfo = offset !== undefined && limit !== undefined
        ? `:${offset + 1}-${offset + limit}`
        : offset !== undefined
          ? `:${offset + 1}`
          : '';
      return { icon: TOOL_ICONS.Read, label: 'Read', detail: _shortPath(fp) + lineInfo, filePath: fp || undefined };
    }
    case 'Write': case 'write_file': {
      const fp = (i['file_path'] as string) ?? (i['path'] as string) ?? '';
      return { icon: TOOL_ICONS.Write, label: 'Write', detail: _shortPath(fp), filePath: fp || undefined };
    }
    case 'Edit': case 'edit_file': {
      const fp = (i['file_path'] as string) ?? (i['path'] as string) ?? '';
      return { icon: TOOL_ICONS.Edit, label: 'Edit', detail: _shortPath(fp), filePath: fp || undefined };
    }
    case 'Bash': case 'bash': case 'execute_command':
      return { icon: TOOL_ICONS.Bash, label: 'Bash', detail: _shortCmd(i['command'] as string ?? '') };
    case 'Glob': case 'glob':
      return { icon: TOOL_ICONS.Glob, label: 'Glob', detail: (i['pattern'] as string ?? '') };
    case 'Grep': case 'grep':
      return { icon: TOOL_ICONS.Grep, label: 'Grep', detail: `"${i['pattern'] as string ?? ''}"` };
    case 'Agent': case 'agent': {
      const agentType = i['subagent_type'] as string | undefined;
      const agentLabel = agentType ? `Agent: ${agentType}` : 'Agent';
      return { icon: TOOL_ICONS.Agent, label: agentLabel, detail: _shortStr(i['description'] as string ?? i['prompt'] as string ?? '') };
    }
    case 'WebFetch': case 'web_fetch':
      return { icon: TOOL_ICONS.Fetch, label: 'Fetch', detail: _shortStr(i['url'] as string ?? '') };
    case 'WebSearch': case 'web_search':
      return { icon: TOOL_ICONS.Search, label: 'Search', detail: _shortStr(i['query'] as string ?? '') };
    case 'TodoWrite': case 'todo_write':
      return { icon: TOOL_ICONS.Todo, label: 'TodoWrite', detail: '' };
    case 'AskUserQuestion': case 'ask_user_question':
      return { icon: TOOL_ICONS.Default, label: 'Ask', detail: _shortStr(i['question'] as string ?? '') };
    case 'PowerShell': case 'powershell':
      return { icon: TOOL_ICONS.Bash, label: 'PowerShell', detail: _shortCmd(i['command'] as string ?? '') };
    case 'Rename': case 'rename_file': {
      const src = (i['source_path'] ?? i['old_path'] ?? i['path'] ?? '') as string;
      const dst = (i['new_path'] ?? i['new_name'] ?? '') as string;
      return { icon: TOOL_ICONS.Edit, label: 'Rename', detail: `${_shortPath(src)} → ${_shortPath(dst)}` };
    }
    case 'Move': case 'move_file': {
      const src = (i['source_path'] ?? i['src'] ?? i['path'] ?? '') as string;
      const dst = (i['destination_path'] ?? i['dst'] ?? i['new_path'] ?? '') as string;
      return { icon: TOOL_ICONS.Edit, label: 'Move', detail: `${_shortPath(src)} → ${_shortPath(dst)}` };
    }
    case 'Delete': case 'delete_file': case 'remove_file': {
      const fp = (i['file_path'] ?? i['path'] ?? '') as string;
      return { icon: TOOL_ICONS.Default, label: 'Delete', detail: _shortPath(fp) };
    }
    case 'Skill': case 'skill':
      return { icon: TOOL_ICONS.Default, label: `/${i['skill'] as string ?? 'skill'}`, detail: _shortStr(i['args'] as string ?? '') };
    default:
      return { icon: TOOL_ICONS.Default, label: name, detail: '' };
  }
}

function _actionVerb(tool: string): string {
  switch (tool) {
    case 'Write': return 'Make this write to';
    case 'Edit':  return 'Make this edit to';
    case 'Bash':  return 'Run this command in';
    case 'Read':  return 'Read file';
    default:      return `Use ${tool} on`;
  }
}

function _shortPath(p: string): string {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/');
  return parts.length > 3 ? '…/' + parts.slice(-2).join('/') : p;
}

function _shortCmd(cmd: string): string {
  if (!cmd) return '';
  const s = cmd.trim().replace(/\s+/g, ' ');
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

function _shortStr(s: string): string {
  if (!s) return '';
  return s.length > 60 ? s.slice(0, 57) + '…' : s;
}

function _renderDiff(diff: string): string {
  const lines = diff.split('\n');
  const rows = lines.map(line => {
    if (line.startsWith('+')) {
      return `<div class="diff-line add"><span class="diff-line-content">${esc(line.slice(1))}</span></div>`;
    } else if (line.startsWith('-')) {
      return `<div class="diff-line del"><span class="diff-line-content">${esc(line.slice(1))}</span></div>`;
    } else if (line.length > 0) {
      return `<div class="diff-line ctx"><span class="diff-line-content">${esc(line.slice(1))}</span></div>`;
    }
    return '';
  }).join('');
  return `<div class="diff-view">${rows}</div>`;
}

function _formatToolResult(name: string, raw: string): string {
  let content = raw;
  // Try unwrap JSON array [{type:'text',text:'...'}]
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      content = parsed.map((x: Record<string,unknown>) =>
        typeof x['text'] === 'string' ? x['text'] : JSON.stringify(x)
      ).join('\n');
    } else if (typeof parsed === 'string') {
      content = parsed;
    } else {
      content = JSON.stringify(parsed, null, 2);
    }
  } catch { /* keep raw */ }

  // Truncate long output
  const lines = content.split('\n');
  const truncated = lines.length > 30;
  const shown = truncated ? lines.slice(0, 30).join('\n') + `\n… (+${lines.length - 30} lines)` : content;

  const isCode = ['Bash','Read','Glob','Grep','Write','Edit'].includes(name);
  if (isCode) {
    return `<pre class="tool-result-pre">${esc(shown)}</pre>`;
  }
  return `<div class="tool-result-text">${esc(shown)}</div>`;
}
