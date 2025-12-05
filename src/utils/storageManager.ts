// ストレージ管理ユーティリティ

/**
 * ストレージの永続化をリクエスト
 * @returns 永続化が許可されたかどうか
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage || !navigator.storage.persist) {
    console.warn('StorageManager API is not supported in this browser');
    return false;
  }

  try {
    const isPersisted = await navigator.storage.persist();
    console.log(`Persistent storage ${isPersisted ? 'granted' : 'denied'}`);
    return isPersisted;
  } catch (error) {
    console.error('Error requesting persistent storage:', error);
    return false;
  }
}

/**
 * ストレージが永続化されているかチェック
 * @returns 永続化されているかどうか
 */
export async function isStoragePersisted(): Promise<boolean> {
  if (!navigator.storage || !navigator.storage.persisted) {
    return false;
  }

  try {
    return await navigator.storage.persisted();
  } catch (error) {
    console.error('Error checking storage persistence:', error);
    return false;
  }
}

/**
 * ストレージ使用量を取得
 * @returns 使用量と割り当て量（バイト）
 */
export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
  usagePercent: number;
  usageMB: number;
  quotaMB: number;
} | null> {
  if (!navigator.storage || !navigator.storage.estimate) {
    return null;
  }

  try {
    const estimate = await navigator.storage.estimate();
    const usage = estimate.usage || 0;
    const quota = estimate.quota || 0;
    const usagePercent = quota > 0 ? (usage / quota) * 100 : 0;
    const usageMB = usage / (1024 * 1024);
    const quotaMB = quota / (1024 * 1024);

    return {
      usage,
      quota,
      usagePercent,
      usageMB,
      quotaMB,
    };
  } catch (error) {
    console.error('Error getting storage estimate:', error);
    return null;
  }
}

/**
 * ブラウザとプラットフォームの情報を取得
 */
export function getPlatformInfo() {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/Chrome/.test(ua);
  const isChrome = /Chrome/.test(ua) && !/Edge/.test(ua);
  const isEdge = /Edg/.test(ua);
  const isFirefox = /Firefox/.test(ua);
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

  return {
    isIOS,
    isSafari,
    isChrome,
    isEdge,
    isFirefox,
    isStandalone,
    isPWA: isStandalone,
    userAgent: ua,
  };
}

/**
 * ストレージ永続性に関するユーザーへのメッセージを生成
 */
export function getStorageAdviceMessage(isPersisted: boolean, platformInfo: ReturnType<typeof getPlatformInfo>): {
  title: string;
  message: string;
  severity: 'success' | 'warning' | 'info';
} {
  // iOS PWA（ホーム画面追加済み）
  if (platformInfo.isIOS && platformInfo.isPWA) {
    return {
      title: 'データ保護',
      message: 'このアプリはホーム画面に追加されているため、データは保護されています。',
      severity: 'success',
    };
  }

  // iOS Safari（ブラウザ）
  if (platformInfo.isIOS && !platformInfo.isPWA) {
    return {
      title: '重要：データ保護について',
      message: 'Safariでは7日間使用しないとデータが削除される可能性があります。ホーム画面に追加すると、データが永続的に保護されます。',
      severity: 'warning',
    };
  }

  // デスクトップ Chrome/Edge（永続化成功）
  if (isPersisted && (platformInfo.isChrome || platformInfo.isEdge)) {
    return {
      title: 'データ保護',
      message: 'ストレージが永続化されました。データは自動削除されません。',
      severity: 'success',
    };
  }

  // デスクトップ Chrome/Edge（永続化失敗）
  if (!isPersisted && (platformInfo.isChrome || platformInfo.isEdge)) {
    return {
      title: 'ストレージ保護',
      message: 'このアプリをよく使用すると、ブラウザがデータを保護します。または、ホーム画面/デスクトップにインストールしてください。',
      severity: 'info',
    };
  }

  // その他のブラウザ
  return {
    title: 'データ保護について',
    message: '重要なデータは定期的にバックアップしてください。ブラウザによっては、ストレージ不足時にデータが削除される可能性があります。',
    severity: 'warning',
  };
}
