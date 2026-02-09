/**
 * AI解析サービス
 * Claude API / OpenAI API を使用してターミナル出力を解析
 * 外部SDKを使わず、fetch APIで直接呼び出す
 */

import { AI_PROVIDER, ANTHROPIC_API_KEY, OPENAI_API_KEY, AI_MODEL } from '../config.js';
import type { AIProviderName } from '../types/index.js';
import logger from './logger.js';

// ============================================================
// AIプロバイダーインターフェース
// ============================================================

/**
 * AIプロバイダーの共通インターフェース
 */
export interface AIProvider {
  /** プロバイダー名 */
  name: AIProviderName;
  /** 使用中のモデル名 */
  model: string;
  /**
   * ターミナル出力を解析する
   * @param context ターミナル出力のテキスト
   * @param question ユーザーからの質問（オプション）
   * @returns AIの回答テキスト
   */
  analyze(context: string, question: string): Promise<string>;
}

// ============================================================
// システムプロンプト
// ============================================================

/** AIへのシステムプロンプト */
const SYSTEM_PROMPT = `あなたはターミナル出力を解析するアシスタントです。
ユーザーが提供するターミナル出力を読み取り、質問に対して簡潔かつ的確に回答してください。

ガイドライン:
- エラーがある場合は原因と解決策を具体的に説明する
- コマンドを提案する場合はコピーペーストできる形式で示す
- 不明な点がある場合は正直に伝える
- 日本語で回答する
- 回答は簡潔にまとめる（長くなりすぎない）`;

// ============================================================
// Claude Provider
// ============================================================

/**
 * Anthropic Messages APIを使用するプロバイダー
 */
class ClaudeProvider implements AIProvider {
  readonly name: AIProviderName = 'claude';
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async analyze(context: string, question: string): Promise<string> {
    const userMessage = this.buildUserMessage(context, question);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `Claude API エラー (${response.status}): ${errorBody}`,
      );
    }

    const data = await response.json() as ClaudeResponse;

    // content配列からテキストを抽出
    const textContent = data.content.find(
      (block) => block.type === 'text',
    );
    if (!textContent || textContent.type !== 'text') {
      throw new Error('Claude API: テキスト応答が見つかりません');
    }
    return textContent.text;
  }

  /**
   * ユーザーメッセージを組み立てる
   */
  private buildUserMessage(context: string, question: string): string {
    let message = `以下はターミナルの出力です:\n\n\`\`\`\n${context}\n\`\`\``;
    if (question) {
      message += `\n\n質問: ${question}`;
    } else {
      message += '\n\nこの出力を解析して、重要なポイントやエラーがあれば教えてください。';
    }
    return message;
  }
}

/** Claude APIレスポンスの型 */
interface ClaudeContentBlock {
  type: 'text';
  text: string;
}

interface ClaudeResponse {
  content: ClaudeContentBlock[];
}

// ============================================================
// OpenAI Provider
// ============================================================

/**
 * OpenAI Chat Completions APIを使用するプロバイダー
 */
class OpenAIProvider implements AIProvider {
  readonly name: AIProviderName = 'openai';
  readonly model: string;
  private readonly apiKey: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async analyze(context: string, question: string): Promise<string> {
    const userMessage = this.buildUserMessage(context, question);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 2048,
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          {
            role: 'user',
            content: userMessage,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenAI API エラー (${response.status}): ${errorBody}`,
      );
    }

    const data = await response.json() as OpenAIResponse;

    if (!data.choices || data.choices.length === 0) {
      throw new Error('OpenAI API: 応答が空です');
    }

    const content = data.choices[0].message.content;
    if (!content) {
      throw new Error('OpenAI API: テキスト応答が見つかりません');
    }
    return content;
  }

  /**
   * ユーザーメッセージを組み立てる
   */
  private buildUserMessage(context: string, question: string): string {
    let message = `以下はターミナルの出力です:\n\n\`\`\`\n${context}\n\`\`\``;
    if (question) {
      message += `\n\n質問: ${question}`;
    } else {
      message += '\n\nこの出力を解析して、重要なポイントやエラーがあれば教えてください。';
    }
    return message;
  }
}

/** OpenAI APIレスポンスの型 */
interface OpenAIResponse {
  choices: Array<{
    message: {
      content: string | null;
    };
  }>;
}

// ============================================================
// ファクトリ関数
// ============================================================

/**
 * 環境変数に基づいてAIプロバイダーを作成する
 * APIキーが設定されていない場合はnullを返す（AI機能無効）
 *
 * @returns AIProvider インスタンス、または null
 */
export function createAIProvider(): AIProvider | null {
  if (AI_PROVIDER === 'claude' && ANTHROPIC_API_KEY) {
    logger.info({ provider: 'Claude', model: AI_MODEL }, 'AI解析: 有効');
    return new ClaudeProvider(ANTHROPIC_API_KEY, AI_MODEL);
  }
  if (AI_PROVIDER === 'openai' && OPENAI_API_KEY) {
    logger.info({ provider: 'OpenAI', model: AI_MODEL }, 'AI解析: 有効');
    return new OpenAIProvider(OPENAI_API_KEY, AI_MODEL);
  }
  logger.info('AI解析: 無効（APIキー未設定）');
  return null;
}
