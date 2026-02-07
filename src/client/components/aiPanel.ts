/**
 * AIパネルコンポーネント
 * ターミナル出力をAIに送信して解析結果を表示する
 */

import type { AIStatusResponse, AIAnalyzeResponse } from '../../types/index.js';
import { sessionStore } from '../state/sessionStore.js';
import { authHeaders } from '../services/api.js';
import { showToast } from './toast.js';

// ==================================================
// 定数
// ==================================================

/** プリセット質問一覧 */
const PRESET_QUESTIONS: string[] = [
  'このエラーの原因と解決策を教えて',
  'このコマンドの出力を要約して',
  '次に実行すべきコマンドを提案して',
  'この警告は無視しても大丈夫？',
];

// ==================================================
// DOM要素の参照
// ==================================================

interface AIPanelElements {
  aiToggleBtn: HTMLButtonElement | null;
  aiPanel: HTMLElement | null;
  aiPresets: HTMLElement | null;
  aiQuestion: HTMLTextAreaElement | null;
  aiSendBtn: HTMLButtonElement | null;
  aiAnswer: HTMLElement | null;
  aiLoading: HTMLElement | null;
  aiProviderLabel: HTMLElement | null;
}

let elements: AIPanelElements = {
  aiToggleBtn: null,
  aiPanel: null,
  aiPresets: null,
  aiQuestion: null,
  aiSendBtn: null,
  aiAnswer: null,
  aiLoading: null,
  aiProviderLabel: null,
};

/** AI機能が有効かどうか */
let aiEnabled = false;

/** 処理中かどうか */
let isAnalyzing = false;

// ==================================================
// AIステータス確認
// ==================================================

/**
 * サーバーのAIステータスを確認して有効/無効を切り替える
 */
export async function checkAIStatus(): Promise<void> {
  try {
    const res = await fetch('/api/ai/status', { headers: authHeaders() });
    if (!res.ok) {
      aiEnabled = false;
      hideAIButton();
      return;
    }
    const status: AIStatusResponse = await res.json();
    aiEnabled = status.enabled;

    if (aiEnabled) {
      showAIButton();
      if (elements.aiProviderLabel && status.provider) {
        const providerName = status.provider === 'claude' ? 'Claude' : 'OpenAI';
        elements.aiProviderLabel.textContent = `${providerName} (${status.model || ''})`;
      }
    } else {
      hideAIButton();
    }
  } catch {
    aiEnabled = false;
    hideAIButton();
  }
}

// ==================================================
// UI表示制御
// ==================================================

/**
 * AIボタンを表示
 */
function showAIButton(): void {
  if (elements.aiToggleBtn) {
    elements.aiToggleBtn.style.display = 'flex';
  }
}

/**
 * AIボタンを非表示
 */
function hideAIButton(): void {
  if (elements.aiToggleBtn) {
    elements.aiToggleBtn.style.display = 'none';
  }
  if (elements.aiPanel) {
    elements.aiPanel.classList.add('hidden');
  }
}

/**
 * AIパネルの表示/非表示をトグル
 */
function toggleAIPanel(): void {
  if (!aiEnabled) return;
  elements.aiPanel?.classList.toggle('hidden');
}

// ==================================================
// ターミナル出力の取得
// ==================================================

/**
 * アクティブセッションのターミナル出力テキストを取得する
 * xterm.jsのバッファから最後N行を取得
 */
function getTerminalOutput(): string {
  const session = sessionStore.getActiveSession();
  if (!session) return '';

  const term = session.term;
  const buffer = term.buffer;
  if (!buffer) return '';

  const activeBuffer = buffer.active;
  if (!activeBuffer) return '';

  const lines: string[] = [];
  const totalRows = activeBuffer.length;

  for (let i = 0; i < totalRows; i++) {
    const line = activeBuffer.getLine(i);
    if (line) {
      const text = line.translateToString(true);
      lines.push(text);
    }
  }

  // 末尾の空行を除去
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }

  return lines.join('\n');
}

// ==================================================
// AI解析リクエスト
// ==================================================

/**
 * AIに解析をリクエストする
 */
async function requestAnalysis(question?: string): Promise<void> {
  if (isAnalyzing) return;

  const context = getTerminalOutput();
  if (!context.trim()) {
    showToast('ターミナル出力がありません', 'warning');
    return;
  }

  isAnalyzing = true;
  updateUIState();

  try {
    const body: { context: string; question?: string } = { context };
    if (question && question.trim()) {
      body.question = question.trim();
    }

    const res = await fetch('/api/ai/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.message || `エラー: ${res.status}`);
    }

    const data: AIAnalyzeResponse = await res.json();
    displayAnswer(data.answer);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'AI解析に失敗しました';
    showToast(message, 'error');
    displayAnswer(`エラー: ${message}`);
  } finally {
    isAnalyzing = false;
    updateUIState();
  }
}

// ==================================================
// 回答表示
// ==================================================

/**
 * AIの回答を表示する（簡易マークダウン変換）
 */
function displayAnswer(text: string): void {
  if (!elements.aiAnswer) return;

  // 簡易的なマークダウン → HTML変換
  const html = convertMarkdownToHtml(text);
  elements.aiAnswer.innerHTML = html;
  elements.aiAnswer.style.display = 'block';
}

/**
 * 簡易マークダウンをHTMLに変換
 */
function convertMarkdownToHtml(text: string): string {
  let html = escapeHtml(text);

  // コードブロック（```...```）
  html = html.replace(/```([a-zA-Z]*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre class="ai-code-block"><code>${code.trim()}</code></pre>`;
  });

  // インラインコード（`...`）
  html = html.replace(/`([^`]+)`/g, '<code class="ai-inline-code">$1</code>');

  // 太字（**...**）
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // 見出し（### / ## / #）
  html = html.replace(/^### (.+)$/gm, '<h4 class="ai-heading">$1</h4>');
  html = html.replace(/^## (.+)$/gm, '<h3 class="ai-heading">$1</h3>');
  html = html.replace(/^# (.+)$/gm, '<h3 class="ai-heading">$1</h3>');

  // リスト（- ）
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
  // 連続するulタグをマージ
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  // 番号付きリスト（1. ）
  html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

  // 改行をbrに変換（pre内部は除外）
  const parts = html.split(/(<pre[\s\S]*?<\/pre>)/);
  html = parts
    .map((part, i) => (i % 2 === 0 ? part.replace(/\n/g, '<br>') : part))
    .join('');

  return html;
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==================================================
// UI状態更新
// ==================================================

/**
 * 送信中/アイドル状態に応じてUIを更新
 */
function updateUIState(): void {
  if (elements.aiSendBtn) {
    elements.aiSendBtn.disabled = isAnalyzing;
    elements.aiSendBtn.textContent = isAnalyzing ? '解析中...' : '送信';
  }
  if (elements.aiLoading) {
    elements.aiLoading.style.display = isAnalyzing ? 'flex' : 'none';
  }
  // プリセットボタンも無効化
  elements.aiPresets?.querySelectorAll<HTMLButtonElement>('button').forEach((btn) => {
    btn.disabled = isAnalyzing;
  });
}

// ==================================================
// 初期化
// ==================================================

/**
 * AIパネルを初期化
 */
export function initAIPanel(): void {
  // DOM要素の取得
  elements = {
    aiToggleBtn: document.getElementById('ai-toggle-btn') as HTMLButtonElement | null,
    aiPanel: document.getElementById('ai-panel'),
    aiPresets: document.getElementById('ai-presets'),
    aiQuestion: document.getElementById('ai-question') as HTMLTextAreaElement | null,
    aiSendBtn: document.getElementById('ai-send-btn') as HTMLButtonElement | null,
    aiAnswer: document.getElementById('ai-answer'),
    aiLoading: document.getElementById('ai-loading'),
    aiProviderLabel: document.getElementById('ai-provider-label'),
  };

  // AIトグルボタン
  elements.aiToggleBtn?.addEventListener('click', toggleAIPanel);

  // 送信ボタン
  elements.aiSendBtn?.addEventListener('click', () => {
    const question = elements.aiQuestion?.value || '';
    requestAnalysis(question);
  });

  // プリセット質問ボタンを生成
  if (elements.aiPresets) {
    PRESET_QUESTIONS.forEach((question) => {
      const btn = document.createElement('button');
      btn.className = 'ai-preset-btn';
      btn.textContent = question;
      btn.addEventListener('click', () => {
        if (elements.aiQuestion) {
          elements.aiQuestion.value = question;
        }
        requestAnalysis(question);
      });
      elements.aiPresets?.appendChild(btn);
    });
  }

  // Enterキーで送信（Shift+Enterは改行）
  elements.aiQuestion?.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const question = elements.aiQuestion?.value || '';
      requestAnalysis(question);
    }
  });

  // 初期状態: AI機能が無効の場合は非表示
  hideAIButton();

  // AIステータスを確認
  checkAIStatus();
}
