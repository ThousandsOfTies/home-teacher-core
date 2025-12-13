// IndexedDB管理ユーティリティ

const DB_NAME = 'TutoTutoDB';
const DB_VERSION = 9; // バージョンを上げて解答ストア追加
const STORE_NAME = 'pdfFiles';
const SNS_STORE_NAME = 'snsLinks';
const GRADING_HISTORY_STORE_NAME = 'gradingHistory';
const SETTINGS_STORE_NAME = 'settings';
const SNS_USAGE_HISTORY_STORE_NAME = 'snsUsageHistory';
const ANSWER_STORE_NAME = 'answers'; // 解答データ用ストア

export interface PDFFileRecord {
  id: string; // ユニークID (ファイル名 + タイムスタンプ)
  fileName: string;
  thumbnail?: string; // 先頭ページのサムネイル画像（Base64）
  fileData?: Blob; // Blob形式のPDFデータ（v6から）
  lastOpened: number; // タイムスタンプ
  lastPageNumber?: number; // 最後に開いていたページ番号
  drawings: Record<number, string>; // ページ番号 -> JSON文字列のマップ
}

export interface SNSLinkRecord {
  id: string; // ユニークID
  name: string; // SNS名（例: Twitter, Instagram）
  url: string; // リンク先URL
  icon: string; // 絵文字アイコン
  createdAt: number; // 作成日時
}

export interface GradingHistoryRecord {
  id: string; // ユニークID
  pdfId: string; // PDFファイルのID
  pdfFileName: string; // 問題集の名称
  pageNumber: number; // ページ番号
  problemNumber: string; // 問題番号
  studentAnswer: string; // 生徒の解答
  isCorrect: boolean; // 正解/不正解
  correctAnswer: string; // 正しい解答
  feedback: string; // フィードバック
  explanation: string; // 解説
  timestamp: number; // 実施時刻（タイムスタンプ）
  imageData?: string; // 採点時の画像データ（オプション）
  matchingMetadata?: {
    method: 'exact' | 'ai' | 'context' | 'hybrid';
    confidence?: string;
    reasoning?: string;
    candidates?: string[];
    similarity?: number;
  }; // マッチング詳細データ（デバッグ用）
}

export interface AppSettings {
  id: 'app-settings'; // 固定ID
  snsTimeLimitMinutes: number; // SNS利用制限時間（分）
  notificationEnabled: boolean; // 通知の有効/無効
  defaultGradingModel?: string; // 採点時のデフォルトAIモデル
}

export interface SNSUsageHistoryRecord {
  id: string; // ユニークID
  snsId: string; // SNSのID
  snsName: string; // SNS名（例: YouTube, Twitter）
  snsUrl: string; // アクセスしたURL
  timeLimitMinutes: number; // 設定されていた制限時間（分）
  timestamp: number; // アクセス日時（タイムスタンプ）
}

// 解答データ（採点精度改善用）
export interface AnswerRecord {
  id: string; // ユニークID (pdfId_page_problem)
  pdfId: string; // 問題集のID
  pageNumber: number; // 解答ページ番号（PDFのページ）
  problemPageNumber?: number; // 問題ページ番号（解答ページから抽出）
  problemNumber: string; // 問題番号（例: "1", "問1", "A"）
  correctAnswer: string; // 正解（例: "12cm", "60°"）
  problemText?: string; // 問題文（オプション）
  sectionName?: string; // AIが返したsectionName（デバッグ用）
  createdAt: number; // 登録日時
  // AIの生の応答データ（デバッグ用）
  rawAiResponse?: {
    problemPage: number | string | null; // AIが返したproblemPage（生データ）
    sectionName: string | null;           // AIが返したsectionName（生データ）
  };
}


function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    console.log('🔓 IndexedDB開く:', {
      dbName: DB_NAME,
      version: DB_VERSION,
      url: window.location.href,
      timestamp: new Date().toISOString()
    });

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('❌ IndexedDB開くエラー:', {
        error: request.error,
        dbName: DB_NAME,
        version: DB_VERSION
      });
      reject(new Error('IndexedDBを開けませんでした'));
    };

    request.onsuccess = () => {
      console.log('✅ IndexedDB開く成功:', {
        dbName: request.result.name,
        version: request.result.version,
        objectStoreNames: Array.from(request.result.objectStoreNames)
      });
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // PDFファイル用オブジェクトストアが存在しない場合は作成
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const objectStore = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        objectStore.createIndex('lastOpened', 'lastOpened', { unique: false });
      }

      // SNSリンク用オブジェクトストアが存在しない場合は作成
      if (!db.objectStoreNames.contains(SNS_STORE_NAME)) {
        const snsStore = db.createObjectStore(SNS_STORE_NAME, { keyPath: 'id' });
        snsStore.createIndex('createdAt', 'createdAt', { unique: false });
      }

      // 採点履歴用オブジェクトストアが存在しない場合は作成
      if (!db.objectStoreNames.contains(GRADING_HISTORY_STORE_NAME)) {
        const historyStore = db.createObjectStore(GRADING_HISTORY_STORE_NAME, { keyPath: 'id' });
        historyStore.createIndex('timestamp', 'timestamp', { unique: false });
        historyStore.createIndex('pdfId', 'pdfId', { unique: false });
        historyStore.createIndex('pageNumber', 'pageNumber', { unique: false });
      }

      // 設定用オブジェクトストアが存在しない場合は作成
      if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
        db.createObjectStore(SETTINGS_STORE_NAME, { keyPath: 'id' });
      }

      // SNS利用履歴用オブジェクトストアが存在しない場合は作成
      if (!db.objectStoreNames.contains(SNS_USAGE_HISTORY_STORE_NAME)) {
        const snsUsageStore = db.createObjectStore(SNS_USAGE_HISTORY_STORE_NAME, { keyPath: 'id' });
        snsUsageStore.createIndex('timestamp', 'timestamp', { unique: false });
        snsUsageStore.createIndex('snsId', 'snsId', { unique: false });
      }

      // 解答データ用オブジェクトストアが存在しない場合は作成
      if (!db.objectStoreNames.contains(ANSWER_STORE_NAME)) {
        const answerStore = db.createObjectStore(ANSWER_STORE_NAME, { keyPath: 'id' });
        answerStore.createIndex('pdfId', 'pdfId', { unique: false });
        answerStore.createIndex('pageNumber', 'pageNumber', { unique: false });
        // 複合インデックス用のキーを別途作成（pdfId_pageNumber_problemNumber）
      }

      // v6へのアップグレード: Base64からBlobへ移行
      if (oldVersion < 6 && db.objectStoreNames.contains(STORE_NAME)) {
        const transaction = (event.target as IDBOpenDBRequest).transaction!;
        const objectStore = transaction.objectStore(STORE_NAME);
        const getAllRequest = objectStore.getAll();

        getAllRequest.onsuccess = () => {
          const records = getAllRequest.result as Array<PDFFileRecord & { fileData?: string | Blob }>;
          console.log(`📦 Base64→Blob移行開始: ${records.length}件のPDF`);

          records.forEach(record => {
            // fileDataが文字列（Base64）の場合のみ変換
            if (record.fileData && typeof record.fileData === 'string') {
              try {
                // Base64をBlobに変換
                const binaryString = atob(record.fileData);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                  bytes[i] = binaryString.charCodeAt(i);
                }
                record.fileData = new Blob([bytes], { type: 'application/pdf' });
                objectStore.put(record);
                console.log(`✅ ${record.fileName} をBlobに変換`);
              } catch (error) {
                console.error(`❌ ${record.fileName} の変換失敗:`, error);
              }
            }
          });

          console.log('✅ Base64→Blob移行完了');
        };
      }
    };
  });
}

// すべてのPDFファイルレコードを取得
export async function getAllPDFRecords(): Promise<PDFFileRecord[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const index = objectStore.index('lastOpened');
    const request = index.openCursor(null, 'prev'); // 最近開いた順

    const records: PDFFileRecord[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        const record = cursor.value;
        console.log('📄 PDFレコード取得:', {
          id: record.id,
          fileName: record.fileName,
          hasFileData: !!record.fileData,
          fileDataType: record.fileData ? (record.fileData instanceof Blob ? 'Blob' : typeof record.fileData) : 'null',
          fileDataSize: record.fileData instanceof Blob ? record.fileData.size : 'N/A'
        });
        records.push(record);
        cursor.continue();
      } else {
        console.log(`✅ 全PDFレコード取得完了: ${records.length}件`);
        resolve(records);
      }
    };

    request.onerror = () => {
      console.error('❌ PDFレコード取得エラー:', request.error);
      reject(new Error('レコードの取得に失敗しました'));
    };
  });
}

// PDFファイルレコードを追加または更新
export async function savePDFRecord(record: PDFFileRecord): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.put(record);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('レコードの保存に失敗しました'));
    };
  });
}

// 特定のPDFファイルレコードを取得
export async function getPDFRecord(id: string): Promise<PDFFileRecord | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error('レコードの取得に失敗しました'));
    };
  });
}

// PDFファイルレコードを削除
export async function deletePDFRecord(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(STORE_NAME);
    const request = objectStore.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('レコードの削除に失敗しました'));
    };
  });
}

// ペン跡を保存
export async function saveDrawing(id: string, pageNumber: number, drawingData: string): Promise<void> {
  const record = await getPDFRecord(id);
  if (!record) {
    throw new Error('PDFレコードが見つかりません');
  }

  record.drawings[pageNumber] = drawingData;
  record.lastOpened = Date.now();

  await savePDFRecord(record);
}

// ペン跡を取得
export async function getDrawing(id: string, pageNumber: number): Promise<string | null> {
  const record = await getPDFRecord(id);
  if (!record) {
    return null;
  }

  return record.drawings[pageNumber] || null;
}

// IDを生成（ファイル名とタイムスタンプから）
export function generatePDFId(fileName: string): string {
  // ファイル名をベースにしたユニークID
  return `${fileName}_${Date.now()}`;
}

// すべてのSNSリンクを取得
export async function getAllSNSLinks(): Promise<SNSLinkRecord[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SNS_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(SNS_STORE_NAME);
    const index = objectStore.index('createdAt');
    const request = index.openCursor(null, 'next'); // 作成日時順

    const records: SNSLinkRecord[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        records.push(cursor.value);
        cursor.continue();
      } else {
        resolve(records);
      }
    };

    request.onerror = () => {
      reject(new Error('SNSリンクの取得に失敗しました'));
    };
  });
}

// SNSリンクを追加または更新
export async function saveSNSLink(record: SNSLinkRecord): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SNS_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(SNS_STORE_NAME);
    const request = objectStore.put(record);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('SNSリンクの保存に失敗しました'));
    };
  });
}

// SNSリンクを削除
export async function deleteSNSLink(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SNS_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(SNS_STORE_NAME);
    const request = objectStore.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('SNSリンクの削除に失敗しました'));
    };
  });
}

// SNSリンクIDを生成
export function generateSNSLinkId(name: string): string {
  return `sns_${name}_${Date.now()}`;
}

// 採点履歴を保存
export async function saveGradingHistory(record: GradingHistoryRecord): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([GRADING_HISTORY_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(GRADING_HISTORY_STORE_NAME);
    const request = objectStore.put(record);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('採点履歴の保存に失敗しました'));
    };
  });
}

// すべての採点履歴を取得（新しい順）
export async function getAllGradingHistory(): Promise<GradingHistoryRecord[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([GRADING_HISTORY_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(GRADING_HISTORY_STORE_NAME);
    const index = objectStore.index('timestamp');
    const request = index.openCursor(null, 'prev'); // 新しい順

    const records: GradingHistoryRecord[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        records.push(cursor.value);
        cursor.continue();
      } else {
        resolve(records);
      }
    };

    request.onerror = () => {
      reject(new Error('採点履歴の取得に失敗しました'));
    };
  });
}

// 特定のPDFの採点履歴を取得
export async function getGradingHistoryByPdfId(pdfId: string): Promise<GradingHistoryRecord[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([GRADING_HISTORY_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(GRADING_HISTORY_STORE_NAME);
    const index = objectStore.index('pdfId');
    const request = index.openCursor(IDBKeyRange.only(pdfId), 'prev');

    const records: GradingHistoryRecord[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        records.push(cursor.value);
        cursor.continue();
      } else {
        resolve(records);
      }
    };

    request.onerror = () => {
      reject(new Error('採点履歴の取得に失敗しました'));
    };
  });
}

// 特定の採点履歴を取得
export async function getGradingHistory(id: string): Promise<GradingHistoryRecord | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([GRADING_HISTORY_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(GRADING_HISTORY_STORE_NAME);
    const request = objectStore.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error('採点履歴の取得に失敗しました'));
    };
  });
}

// 採点履歴を削除
export async function deleteGradingHistory(id: string): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([GRADING_HISTORY_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(GRADING_HISTORY_STORE_NAME);
    const request = objectStore.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('採点履歴の削除に失敗しました'));
    };
  });
}

// アプリ設定を取得
export async function getAppSettings(): Promise<AppSettings> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SETTINGS_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(SETTINGS_STORE_NAME);
    const request = objectStore.get('app-settings');

    request.onsuccess = () => {
      const settings = request.result as AppSettings | undefined;
      // デフォルト値: 30分、通知無効、モデルは未指定（バックエンドのデフォルト使用）
      resolve(settings || {
        id: 'app-settings',
        snsTimeLimitMinutes: 30,
        notificationEnabled: false,
        defaultGradingModel: undefined
      });
    };

    request.onerror = () => {
      reject(new Error('設定の取得に失敗しました'));
    };
  });
}

// アプリ設定を保存
export async function saveAppSettings(settings: AppSettings): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([SETTINGS_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(SETTINGS_STORE_NAME);
    const request = objectStore.put(settings);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      reject(new Error('設定の保存に失敗しました'));
    };
  });
}

// 採点履歴IDを生成
export function generateGradingHistoryId(): string {
  return `grading_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// SNS利用履歴を保存
export async function saveSNSUsageHistory(record: Omit<SNSUsageHistoryRecord, 'id'>): Promise<void> {
  return new Promise((resolve, reject) => {
    openDB().then((db) => {
      const transaction = db.transaction([SNS_USAGE_HISTORY_STORE_NAME], 'readwrite');
      const objectStore = transaction.objectStore(SNS_USAGE_HISTORY_STORE_NAME);

      const historyRecord: SNSUsageHistoryRecord = {
        id: `sns_usage_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
        ...record
      };

      const request = objectStore.add(historyRecord);

      transaction.oncomplete = () => {
        console.log('✅ SNS利用履歴を保存:', historyRecord);
        resolve();
      };

      request.onerror = () => {
        console.error('❌ SNS利用履歴の保存に失敗:', request.error);
        reject(new Error('SNS利用履歴の保存に失敗しました'));
      };
    }).catch(reject);
  });
}

// SNS利用履歴を取得（新しい順）
export async function getSNSUsageHistory(): Promise<SNSUsageHistoryRecord[]> {
  return new Promise((resolve, reject) => {
    openDB().then((db) => {
      const transaction = db.transaction([SNS_USAGE_HISTORY_STORE_NAME], 'readonly');
      const objectStore = transaction.objectStore(SNS_USAGE_HISTORY_STORE_NAME);
      const index = objectStore.index('timestamp');
      const request = index.openCursor(null, 'prev'); // 新しい順

      const results: SNSUsageHistoryRecord[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          console.log('✅ SNS利用履歴を取得:', results.length);
          resolve(results);
        }
      };

      request.onerror = () => {
        console.error('❌ SNS利用履歴の取得に失敗:', request.error);
        reject(new Error('SNS利用履歴の取得に失敗しました'));
      };
    }).catch(reject);
  });
}

// ========================================
// 解答データ管理（採点精度改善用）
// ========================================

// 解答IDを生成
export function generateAnswerId(pdfId: string, pageNumber: number, problemNumber: string): string {
  return `answer_${pdfId}_${pageNumber}_${problemNumber}`;
}

// 解答を保存
export async function saveAnswer(record: AnswerRecord): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ANSWER_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(ANSWER_STORE_NAME);
    const request = objectStore.put(record);

    request.onsuccess = () => {
      console.log('✅ 解答を保存:', record.id);
      resolve();
    };

    request.onerror = () => {
      console.error('❌ 解答の保存に失敗:', request.error);
      reject(new Error('解答の保存に失敗しました'));
    };
  });
}

// 複数の解答を一括保存
export async function saveAnswers(records: AnswerRecord[]): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ANSWER_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(ANSWER_STORE_NAME);

    let completed = 0;
    let hasError = false;

    records.forEach(record => {
      const request = objectStore.put(record);

      request.onsuccess = () => {
        completed++;
        if (completed === records.length && !hasError) {
          console.log(`✅ ${records.length}件の解答を保存`);
          resolve();
        }
      };

      request.onerror = () => {
        if (!hasError) {
          hasError = true;
          console.error('❌ 解答の保存に失敗:', request.error);
          reject(new Error('解答の保存に失敗しました'));
        }
      };
    });

    if (records.length === 0) {
      resolve();
    }
  });
}

// 特定のページ・問題番号の解答を取得
export async function getAnswer(pdfId: string, pageNumber: number, problemNumber: string): Promise<AnswerRecord | null> {
  const id = generateAnswerId(pdfId, pageNumber, problemNumber);
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ANSWER_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(ANSWER_STORE_NAME);
    const request = objectStore.get(id);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      reject(new Error('解答の取得に失敗しました'));
    };
  });
}

// 特定のPDFの全解答を取得
export async function getAnswersByPdfId(pdfId: string): Promise<AnswerRecord[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ANSWER_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(ANSWER_STORE_NAME);
    const index = objectStore.index('pdfId');
    const request = index.openCursor(IDBKeyRange.only(pdfId));

    const records: AnswerRecord[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor) {
        records.push(cursor.value);
        cursor.continue();
      } else {
        console.log(`✅ ${pdfId}の解答を取得: ${records.length}件`);
        resolve(records);
      }
    };

    request.onerror = () => {
      reject(new Error('解答の取得に失敗しました'));
    };
  });
}

// 特定のPDFの解答をすべて削除
export async function deleteAnswersByPdfId(pdfId: string): Promise<void> {
  const answers = await getAnswersByPdfId(pdfId);
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([ANSWER_STORE_NAME], 'readwrite');
    const objectStore = transaction.objectStore(ANSWER_STORE_NAME);

    let completed = 0;
    let hasError = false;

    answers.forEach(answer => {
      const request = objectStore.delete(answer.id);

      request.onsuccess = () => {
        completed++;
        if (completed === answers.length && !hasError) {
          console.log(`✅ ${pdfId}の解答を削除: ${answers.length}件`);
          resolve();
        }
      };

      request.onerror = () => {
        if (!hasError) {
          hasError = true;
          reject(new Error('解答の削除に失敗しました'));
        }
      };
    });

    if (answers.length === 0) {
      resolve();
    }
  });
}

// ========================================
// デバッグ用: 登録済み解答をコンソールに出力
// ========================================

// 全解答をダンプ（ブラウザコンソールから: window.dumpAllAnswers()）
export async function dumpAllAnswers(): Promise<void> {
  const db = await openDB();

  return new Promise((resolve) => {
    const transaction = db.transaction([ANSWER_STORE_NAME], 'readonly');
    const objectStore = transaction.objectStore(ANSWER_STORE_NAME);
    const request = objectStore.getAll();

    request.onsuccess = () => {
      const answers = request.result as AnswerRecord[];

      console.log('='.repeat(80));
      console.log('📚 登録済み解答一覧 (全' + answers.length + '件)');
      console.log('='.repeat(80));

      // PDF IDごとにグループ化
      const byPdfId = answers.reduce((acc, ans) => {
        if (!acc[ans.pdfId]) acc[ans.pdfId] = [];
        acc[ans.pdfId].push(ans);
        return acc;
      }, {} as Record<string, AnswerRecord[]>);

      for (const [pdfId, pdfAnswers] of Object.entries(byPdfId)) {
        console.log(`\n📄 PDF: ${pdfId} (${pdfAnswers.length}件)`);
        console.log('-'.repeat(60));

        // 問題ページ番号でソート
        pdfAnswers.sort((a, b) => {
          const pageA = a.problemPageNumber ?? 9999;
          const pageB = b.problemPageNumber ?? 9999;
          if (pageA !== pageB) return pageA - pageB;
          return a.problemNumber.localeCompare(b.problemNumber);
        });

        for (const ans of pdfAnswers) {
          console.log(`  問題ページ: ${ans.problemPageNumber ?? '未設定'} | 問題番号: ${ans.problemNumber} | 正解: ${ans.correctAnswer}`);
          if (ans.rawAiResponse) {
            console.log(`    └─ AI生データ: problemPage=${ans.rawAiResponse.problemPage}, sectionName="${ans.rawAiResponse.sectionName ?? ''}"`);
          }
        }
      }

      console.log('\n' + '='.repeat(80));
      console.log('💡 ヒント: 個別PDFの確認は window.dumpAnswersByPdf("PDF_ID") を使用');
      console.log('='.repeat(80));

      resolve();
    };
  });
}

// 特定PDFの解答をダンプ（ブラウザコンソールから: window.dumpAnswersByPdf("PDF_ID")）
export async function dumpAnswersByPdf(pdfId: string): Promise<void> {
  const answers = await getAnswersByPdfId(pdfId);

  console.log('='.repeat(80));
  console.log(`📚 PDF「${pdfId}」の登録済み解答 (${answers.length}件)`);
  console.log('='.repeat(80));

  // 問題ページ番号でソート
  answers.sort((a, b) => {
    const pageA = a.problemPageNumber ?? 9999;
    const pageB = b.problemPageNumber ?? 9999;
    if (pageA !== pageB) return pageA - pageB;
    return a.problemNumber.localeCompare(b.problemNumber);
  });

  for (const ans of answers) {
    console.log(`問題ページ: ${String(ans.problemPageNumber ?? '???').padStart(3)} | PDFページ: ${String(ans.pageNumber).padStart(3)} | 問題: ${ans.problemNumber.padEnd(10)} | 正解: ${ans.correctAnswer}`);
    console.log(`  └─ セクション名: "${ans.sectionName ?? 'なし'}"`);
    if (ans.rawAiResponse) {
      console.log(`  └─ AI生データ: problemPage=${JSON.stringify(ans.rawAiResponse.problemPage)}, sectionName="${ans.rawAiResponse.sectionName ?? ''}"`);
    }
    console.log('');
  }

  console.log('='.repeat(80));
}

// グローバルに公開（ブラウザコンソールから呼び出せるように）
if (typeof window !== 'undefined') {
  (window as any).dumpAllAnswers = dumpAllAnswers;
  (window as any).dumpAnswersByPdf = dumpAnswersByPdf;
  console.log('🔧 デバッグ用コマンド利用可能:');
  console.log('   - window.dumpAllAnswers() : 全解答をダンプ');
  console.log('   - window.dumpAnswersByPdf("PDF_ID") : 特定PDFの解答をダンプ');
}
