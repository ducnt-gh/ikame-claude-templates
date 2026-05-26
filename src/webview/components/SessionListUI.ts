interface VsCodeApi {
  postMessage: (msg: unknown) => void;
  getState: () => unknown;
  setState: (s: unknown) => void;
}

interface Session {
  id: string;
  title: string;
  msgs: unknown[];
  createdAt: number;
}

function mk(tag: string, cls: string): HTMLElement {
  const e = document.createElement(tag); e.className = cls; return e;
}

function fmtTime(ts: number): string {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return new Date(ts).toLocaleDateString();
}

const I = {
  edit:  `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8.5 1.5l2 2-7 7H1.5v-2l7-7z"/></svg>`,
  trash: `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 3h8M5 3V2h2v1M3 3l1 7h4l1-7"/></svg>`,
  pin:   `<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2l2 2-1 3-2-2-3 3-1-1 3-3-2-2 4 0z"/></svg>`,
};

export class SessionListUI {
  private _vs: VsCodeApi;
  private _sessions: Session[] = [];
  private _activeSessionId: string | null = null;
  private _listEl!: HTMLElement;
  private _searchInput!: HTMLInputElement;

  constructor(vs: VsCodeApi) {
    this._vs = vs;
    this._loadState();
  }

  render(): HTMLElement {
    const root = mk('div', 'sl-root');

    // Header
    const hdr = mk('div', 'sl-header');
    const title = mk('span', 'sl-title'); title.textContent = 'CLAUDE CODE';
    const newBtn = document.createElement('button');
    newBtn.className = 'sl-new-btn';
    newBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><path d="M6 1a1 1 0 011 1v3h3a1 1 0 010 2H7v3a1 1 0 01-2 0V7H2a1 1 0 010-2h3V2a1 1 0 011-1z"/></svg> New session`;
    newBtn.onclick = () => this._onNewSession();
    hdr.append(title, newBtn);


    // Search
    const search = mk('div', 'sl-search');
    this._searchInput = document.createElement('input');
    this._searchInput.placeholder = 'Search sessions...';
    this._searchInput.className = 'sl-search-input';
    this._searchInput.oninput = () => this._renderList(this._searchInput.value);
    search.appendChild(this._searchInput);

    // List
    this._listEl = mk('div', 'sl-list');
    this._renderList('');

    root.innerHTML = '';
    const hdr2 = mk('div', 'sl-header');
    hdr2.append(title);
    const newRow = mk('div', 'sl-new-row');
    newRow.appendChild(newBtn);
    root.append(hdr2, newRow, search, this._listEl);

    return root;
  }

  updateSessions(sessions: Session[], activeId: string | null): void {
    this._sessions = sessions;
    this._activeSessionId = activeId;
    this._saveState();
    this._renderList(this._searchInput?.value ?? '');
  }

  private _renderList(filter: string): void {
    if (!this._listEl) return;
    this._listEl.innerHTML = '';

    const all = this._sessions.filter(s =>
      s.title.toLowerCase().includes(filter.toLowerCase())
    );

    if (!all.length) {
      const empty = mk('div', 'sl-empty');
      empty.textContent = filter ? 'No matching sessions' : 'No sessions yet';
      this._listEl.appendChild(empty);
      return;
    }

    const groups: Record<string, Session[]> = {};
    const now = Date.now();
    all.forEach(s => {
      const diff = now - s.createdAt;
      const g = diff < 86400000 ? 'Today'
               : diff < 172800000 ? 'Yesterday'
               : diff < 604800000 ? 'Last 7 days'
               : 'Older';
      (groups[g] ??= []).push(s);
    });

    ['Today', 'Yesterday', 'Last 7 days', 'Older'].forEach(g => {
      if (!groups[g]) return;
      const lbl = mk('div', 'sl-group-label'); lbl.textContent = g;
      this._listEl.appendChild(lbl);

      groups[g].forEach(s => {
        const item = mk('div', `sl-item${s.id === this._activeSessionId ? ' active' : ''}`);

        const body = mk('div', 'sl-item-body');
        const name = mk('div', 'sl-item-name'); name.textContent = s.title;
        const meta = mk('div', 'sl-item-meta'); meta.textContent = fmtTime(s.createdAt);
        body.append(name, meta);

        const acts = mk('div', 'sl-item-acts');
        const renBtn = document.createElement('button');
        renBtn.className = 'sl-act-btn'; renBtn.title = 'Rename'; renBtn.innerHTML = I.edit;
        renBtn.onclick = e => {
          e.stopPropagation();
          const prev = s.title;
          const input = document.createElement('input');
          input.className = 'sl-item-name-input';
          input.value = prev;
          name.replaceWith(input);
          input.focus();
          input.select();
          const commit = () => {
            const v = input.value.trim();
            if (v) s.title = v;
            input.replaceWith(name);
            name.textContent = s.title;
            this._saveState();
            this._renderList(filter);
            this._vs.postMessage({ type: 'renameSession', payload: { id: s.id, title: s.title } });
          };
          input.onblur = commit;
          input.onkeydown = ke => {
            if (ke.key === 'Enter') { input.blur(); }
            if (ke.key === 'Escape') { input.value = prev; input.blur(); }
          };
        };
        const delBtn = document.createElement('button');
        delBtn.className = 'sl-act-btn'; delBtn.title = 'Delete'; delBtn.innerHTML = I.trash;
        delBtn.onclick = e => {
          e.stopPropagation();
          this._sessions = this._sessions.filter(x => x.id !== s.id);
          this._saveState();
          this._renderList(filter);
          this._vs.postMessage({ type: 'deleteSession', payload: s.id });
        };
        acts.append(renBtn, delBtn);

        item.append(body, acts);
        item.onclick = () => this._onOpenSession(s.id);
        this._listEl.appendChild(item);
      });
    });
  }

  private _onNewSession(): void {
    this._vs.postMessage({ type: 'newSession' });
  }

  private _onOpenSession(id: string): void {
    this._activeSessionId = id;
    this._saveState();
    this._renderList(this._searchInput?.value ?? '');
    this._vs.postMessage({ type: 'openSession', payload: id });
  }

  private _saveState(): void {
    try {
      this._vs.setState({ sessions: this._sessions.slice(0, 100), activeSessionId: this._activeSessionId });
    } catch { /* ignore */ }
  }

  private _loadState(): void {
    try {
      const st = this._vs.getState() as Record<string, unknown> | null;
      if (!st) return;
      this._sessions = (st['sessions'] as Session[]) ?? [];
      this._activeSessionId = (st['activeSessionId'] as string) ?? null;
    } catch { /* ignore */ }
  }
}
