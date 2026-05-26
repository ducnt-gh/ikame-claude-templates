/**
 * Minimal MCP HTTP server that exposes AskUserQuestion as a real tool.
 * Claude CLI connects via --mcp-config + --disallowed-tools AskUserQuestion.
 * When Claude calls mcp__ikame-ask__AskUserQuestion, the server blocks the
 * HTTP request until the extension injects the user's answer from the webview.
 */
import * as http from 'http';
import * as net from 'net';

export type QuestionPayload = {
  toolUseId: string;
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description?: string }>;
    multiSelect: boolean;
  }>;
};

type PendingCall = {
  resolve: (answer: string) => void;
  payload: QuestionPayload;
};

export class McpServer {
  private _server: http.Server;
  private _port = 0;
  private _pending = new Map<string, PendingCall>();
  private _onQuestion?: (payload: QuestionPayload) => void;

  constructor() {
    this._server = http.createServer((req, res) => this._handle(req, res));
  }

  get port(): number { return this._port; }

  onQuestion(cb: (payload: QuestionPayload) => void): void {
    this._onQuestion = cb;
  }

  /** Called by extension when user submits answer in webview */
  answerQuestion(toolUseId: string, answers: Record<string, string>): void {
    const pending = this._pending.get(toolUseId);
    if (!pending) return;
    this._pending.delete(toolUseId);
    const answerText = Object.entries(answers).map(([k, v]) => `${k}: ${v}`).join('\n');
    pending.resolve(answerText);
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this._server.listen(0, '127.0.0.1', () => {
        const addr = this._server.address() as net.AddressInfo;
        this._port = addr.port;
        resolve();
      });
      this._server.on('error', reject);
    });
  }

  stop(): void {
    this._server.close();
    for (const [, p] of this._pending) p.resolve('(no answer — server stopped)');
    this._pending.clear();
  }

  /** --mcp-config JSON string for Claude CLI */
  mcpConfigJson(): string {
    return JSON.stringify({
      mcpServers: {
        'extension': {
          type: 'http',
          url: `http://127.0.0.1:${this._port}/mcp`,
        },
      },
    });
  }

  private _handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const chunks: Buffer[] = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      let json: Record<string, unknown> = {};
      try { json = JSON.parse(body); } catch { /* empty */ }

      const method = json['method'] as string | undefined;

      if (method === 'initialize') {
        this._json(res, {
          jsonrpc: '2.0', id: json['id'],
          result: {
            protocolVersion: '2024-11-05',
            capabilities: { tools: {} },
            serverInfo: { name: 'ikame-ask', version: '1.0.0' },
          },
        });
        return;
      }

      if (method === 'tools/list') {
        this._json(res, {
          jsonrpc: '2.0', id: json['id'],
          result: {
            tools: [{
              name: 'AskUserQuestion',
              description: 'Ask the user one or more questions and collect their answers via an interactive dialog in the IDE.',
              inputSchema: {
                type: 'object',
                properties: {
                  questions: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        question:    { type: 'string' },
                        header:      { type: 'string' },
                        multiSelect: { type: 'boolean' },
                        options: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              label:       { type: 'string' },
                              description: { type: 'string' },
                            },
                            required: ['label'],
                          },
                        },
                      },
                      required: ['question', 'header', 'options', 'multiSelect'],
                    },
                  },
                },
                required: ['questions'],
              },
            }],
          },
        });
        return;
      }

      if (method === 'tools/call') {
        const params = json['params'] as Record<string, unknown> | undefined;
        const toolName = params?.['name'] as string | undefined;
        const toolInput = params?.['arguments'] as Record<string, unknown> | undefined;
        const callId = String(json['id'] ?? Date.now());

        if (toolName !== 'AskUserQuestion' || !toolInput) {
          this._json(res, { jsonrpc: '2.0', id: json['id'], error: { code: -32601, message: 'Unknown tool' } });
          return;
        }

        const payload: QuestionPayload = {
          toolUseId: callId,
          questions: toolInput['questions'] as QuestionPayload['questions'],
        };

        // Block this HTTP request until user answers
        const answerPromise = new Promise<string>(resolve => {
          this._pending.set(callId, { resolve, payload });
        });

        // Show dialog in webview
        this._onQuestion?.(payload);

        // Respond when user answers
        answerPromise.then(answer => {
          this._json(res, {
            jsonrpc: '2.0', id: json['id'],
            result: { content: [{ type: 'text', text: answer }] },
          });
        });
        return;
      }

      // notifications/initialized and others
      res.writeHead(200); res.end('{}');
    });
  }

  private _json(res: http.ServerResponse, data: unknown): void {
    const body = JSON.stringify(data);
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  }
}
