/**
 * notification.ts のテスト
 * ブラウザ通知サービスの設定管理・通知表示ロジックをテスト
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================
// モック設定（vi.hoisted を使用してホイスティング対応）
// ============================================================

const { mockShowToast } = vi.hoisted(() => ({
  mockShowToast: vi.fn(),
}));

vi.mock('../../../src/client/components/toast.js', () => ({
  showToast: mockShowToast,
}));

// localStorage のモック
const localStorageStore: Record<string, string> = {};
const mockLocalStorage = {
  getItem: vi.fn((key: string) => localStorageStore[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageStore[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageStore[key];
  }),
  clear: vi.fn(() => {
    for (const key of Object.keys(localStorageStore)) {
      delete localStorageStore[key];
    }
  }),
};
vi.stubGlobal('localStorage', mockLocalStorage);

// Notification API のモック
let mockPermission: NotificationPermission = 'default';
let lastNotificationInstance: { addEventListener: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } | null =
  null;

// Notification をクラスとしてモック（new で呼べるようにする）
class MockNotification {
  body: string;
  icon: string;
  tag: string;
  addEventListener = vi.fn();
  close = vi.fn();

  static get permission(): NotificationPermission {
    return mockPermission;
  }

  static requestPermission = vi.fn().mockResolvedValue('granted' as NotificationPermission);

  constructor(
    public title: string,
    options?: { body?: string; icon?: string; tag?: string },
  ) {
    this.body = options?.body || '';
    this.icon = options?.icon || '';
    this.tag = options?.tag || '';
    lastNotificationInstance = this;
  }
}

vi.stubGlobal('Notification', MockNotification);

// document.hidden のモック
let mockDocumentHidden = false;
Object.defineProperty(globalThis, 'document', {
  value: {
    get hidden() {
      return mockDocumentHidden;
    },
  },
  writable: true,
  configurable: true,
});

// window のモック（Notification を含める）
vi.stubGlobal('window', {
  focus: vi.fn(),
  Notification: MockNotification,
});

// ============================================================
// テスト
// ============================================================

import {
  requestPermission,
  isPermissionGranted,
  getPermissionState,
  loadSettings,
  setEnabled,
  setErrorEnabled,
  setExitEnabled,
  getSettings,
  showNotification,
  initNotification,
} from '../../../src/client/services/notification.js';

describe('通知サービス', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPermission = 'default';
    mockDocumentHidden = false;

    // localStorage をクリア
    for (const key of Object.keys(localStorageStore)) {
      delete localStorageStore[key];
    }

    // 設定をリセットするため initNotification を呼ぶ
    initNotification();
  });

  // ============================================================
  // 通知許可リクエストのテスト
  // ============================================================

  describe('requestPermission', () => {
    it('既に許可済みの場合はtrueを返す', async () => {
      mockPermission = 'granted';
      const result = await requestPermission();
      expect(result).toBe(true);
    });

    it('ブロック済みの場合はfalseを返す', async () => {
      mockPermission = 'denied';
      const result = await requestPermission();
      expect(result).toBe(false);
    });

    it('default状態の場合は許可をリクエストし、granted時にtrueを返す', async () => {
      mockPermission = 'default';
      MockNotification.requestPermission = vi.fn().mockResolvedValue('granted');
      const result = await requestPermission();
      expect(result).toBe(true);
      expect(MockNotification.requestPermission).toHaveBeenCalled();
    });

    it('default状態で拒否された場合はfalseを返す', async () => {
      mockPermission = 'default';
      MockNotification.requestPermission = vi.fn().mockResolvedValue('denied');
      const result = await requestPermission();
      expect(result).toBe(false);
    });
  });

  // ============================================================
  // 許可状態チェックのテスト
  // ============================================================

  describe('isPermissionGranted', () => {
    it('許可済みの場合はtrueを返す', () => {
      mockPermission = 'granted';
      expect(isPermissionGranted()).toBe(true);
    });

    it('許可されていない場合はfalseを返す', () => {
      mockPermission = 'denied';
      expect(isPermissionGranted()).toBe(false);
    });

    it('default状態の場合はfalseを返す', () => {
      mockPermission = 'default';
      expect(isPermissionGranted()).toBe(false);
    });
  });

  // ============================================================
  // 許可状態取得のテスト
  // ============================================================

  describe('getPermissionState', () => {
    it('grantedを返す', () => {
      mockPermission = 'granted';
      expect(getPermissionState()).toBe('granted');
    });

    it('deniedを返す', () => {
      mockPermission = 'denied';
      expect(getPermissionState()).toBe('denied');
    });

    it('defaultを返す', () => {
      mockPermission = 'default';
      expect(getPermissionState()).toBe('default');
    });
  });

  // ============================================================
  // 設定管理のテスト
  // ============================================================

  describe('loadSettings', () => {
    it('デフォルトでは全設定がtrueになる', () => {
      const settings = loadSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.errorEnabled).toBe(true);
      expect(settings.exitEnabled).toBe(true);
    });

    it('LocalStorageの値に基づいて設定を復元する', () => {
      localStorageStore['pdr-notification-enabled'] = 'false';
      localStorageStore['pdr-notification-error'] = 'false';
      localStorageStore['pdr-notification-exit'] = 'false';

      const settings = loadSettings();
      expect(settings.enabled).toBe(false);
      expect(settings.errorEnabled).toBe(false);
      expect(settings.exitEnabled).toBe(false);
    });

    it('trueの値も正しく復元する', () => {
      localStorageStore['pdr-notification-enabled'] = 'true';
      localStorageStore['pdr-notification-error'] = 'true';
      localStorageStore['pdr-notification-exit'] = 'true';

      const settings = loadSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.errorEnabled).toBe(true);
      expect(settings.exitEnabled).toBe(true);
    });
  });

  describe('setEnabled', () => {
    it('通知を無効にできる', () => {
      setEnabled(false);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('pdr-notification-enabled', 'false');
      expect(getSettings().enabled).toBe(false);
    });

    it('通知を有効にできる', () => {
      setEnabled(true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('pdr-notification-enabled', 'true');
      expect(getSettings().enabled).toBe(true);
    });
  });

  describe('setErrorEnabled', () => {
    it('エラー通知を無効にできる', () => {
      setErrorEnabled(false);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('pdr-notification-error', 'false');
      expect(getSettings().errorEnabled).toBe(false);
    });

    it('エラー通知を有効にできる', () => {
      setErrorEnabled(true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('pdr-notification-error', 'true');
      expect(getSettings().errorEnabled).toBe(true);
    });
  });

  describe('setExitEnabled', () => {
    it('終了通知を無効にできる', () => {
      setExitEnabled(false);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('pdr-notification-exit', 'false');
      expect(getSettings().exitEnabled).toBe(false);
    });

    it('終了通知を有効にできる', () => {
      setExitEnabled(true);
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('pdr-notification-exit', 'true');
      expect(getSettings().exitEnabled).toBe(true);
    });
  });

  describe('getSettings', () => {
    it('設定オブジェクトのコピーを返す（参照ではない）', () => {
      const s1 = getSettings();
      const s2 = getSettings();
      expect(s1).toEqual(s2);
      expect(s1).not.toBe(s2);
    });
  });

  // ============================================================
  // 通知表示のテスト
  // ============================================================

  describe('showNotification', () => {
    it('通知が無効の場合は何もしない', () => {
      setEnabled(false);
      showNotification('テスト', '本文');
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('フォアグラウンド時はトーストで表示する', () => {
      mockDocumentHidden = false;
      showNotification('タイトル', '本文', 'info');
      expect(mockShowToast).toHaveBeenCalledWith('タイトル: 本文', 'info', 5000);
    });

    it('errorレベルでerrorEnabledがfalseの場合は何もしない', () => {
      setErrorEnabled(false);
      showNotification('エラー', '詳細', 'error');
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('successレベルでexitEnabledがfalseの場合は何もしない', () => {
      setExitEnabled(false);
      showNotification('完了', '詳細', 'success');
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('warningレベルでexitEnabledがfalseの場合は何もしない', () => {
      setExitEnabled(false);
      showNotification('警告', '詳細', 'warning');
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('バックグラウンド時かつ許可済みの場合はブラウザ通知を表示する', () => {
      mockDocumentHidden = true;
      mockPermission = 'granted';
      lastNotificationInstance = null;

      showNotification('タイトル', '本文', 'error');

      // Notification インスタンスが作成されたことを確認
      expect(lastNotificationInstance).not.toBeNull();
      expect(lastNotificationInstance!.close).toBeDefined();
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('バックグラウンド時に許可がない場合は何も表示しない', () => {
      mockDocumentHidden = true;
      mockPermission = 'denied';
      lastNotificationInstance = null;

      showNotification('タイトル', '本文', 'error');
      expect(lastNotificationInstance).toBeNull();
      expect(mockShowToast).not.toHaveBeenCalled();
    });

    it('デフォルトレベルはinfoである', () => {
      mockDocumentHidden = false;
      showNotification('テスト', '本文');
      expect(mockShowToast).toHaveBeenCalledWith('テスト: 本文', 'info', 5000);
    });

    it('各レベルに対応するToastTypeでトーストを表示する', () => {
      mockDocumentHidden = false;

      showNotification('成功', '本文', 'success');
      expect(mockShowToast).toHaveBeenCalledWith('成功: 本文', 'success', 5000);

      showNotification('エラー', '本文', 'error');
      expect(mockShowToast).toHaveBeenCalledWith('エラー: 本文', 'error', 5000);
    });
  });

  // ============================================================
  // 初期化のテスト
  // ============================================================

  describe('initNotification', () => {
    it('LocalStorageから設定を読み込む', () => {
      localStorageStore['pdr-notification-enabled'] = 'false';
      initNotification();
      expect(getSettings().enabled).toBe(false);
    });
  });
});
