/** 認証設定の検証。トークン自体は正規化せず、照合時の値を保持する。 */
export function isConfiguredAuthToken(token: string | undefined): token is string {
  const value = token?.trim();
  return Boolean(value && value !== 'change-me' && value !== 'pdr-local');
}

/** リスナーを作成する前に、不安全な認証設定での起動を止める。 */
export function assertAuthTokenConfigured(token: string | undefined): void {
  if (!isConfiguredAuthToken(token)) {
    // 設定値はエラーに含めない。
    throw new Error(
      'AUTH_TOKEN must be set to a non-blank, non-placeholder secret before starting the server.',
    );
  }
}
