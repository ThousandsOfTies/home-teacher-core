import { useState, useEffect } from 'react';
import { PDFFileRecord, getAppSettings, saveAppSettings } from '../../utils/indexedDB';
import { getPlatformInfo } from '../../utils/storageManager';
import GradingHistory from './GradingHistory';
import { usePDFRecords } from '../../hooks/admin/usePDFRecords';
import { useSNSLinks } from '../../hooks/admin/useSNSLinks';
import { useStorage } from '../../hooks/admin/useStorage';
import AdSlot from '../ads/AdSlot';
import './AdminPanel.css';
import { PREDEFINED_SNS, getSNSIcon } from '../../constants/sns';
import DrillCatalog from '../drill/DrillCatalog';
import PrivacyPolicy from '../legal/PrivacyPolicy';
import TermsOfService from '../legal/TermsOfService';
import About from '../legal/About';
import Contact from '../legal/Contact';
import { FaEarthAmericas } from 'react-icons/fa6';
import { FaRegEdit } from 'react-icons/fa';
import { IoIosFolderOpen, IoMdSettings } from 'react-icons/io';
import { ImFilePdf } from 'react-icons/im';
import { VscDatabase } from 'react-icons/vsc';
import { ICON_SVG } from '../../constants/icons';
import { useTranslation } from 'react-i18next';
import { getSubjects, SubjectInfo, SubjectsResponse } from '../../services/api';
import { updatePDFRecord } from '../../utils/indexedDB';

interface AdminPanelProps {
  onSelectPDF: (record: PDFFileRecord) => void;
  hasUpdate?: boolean;
  onUpdate?: () => void;
}

export default function AdminPanel({ onSelectPDF, hasUpdate = false, onUpdate }: AdminPanelProps) {
  // i18n
  const { t, i18n } = useTranslation();

  // Custom hooks
  const {
    pdfRecords,
    loading,
    uploading,
    errorMessage: pdfError,
    setErrorMessage: setPdfError,
    loadPDFRecords,
    handleFileSelect,
    handleDeleteRecord,
    addPDF
  } = usePDFRecords();

  const {
    snsLinks,
    selectedSNS,
    customUrls,
    loadSNSLinks,
    toggleSNS,
    updateCustomUrl,
    saveSNSSettings: saveSNSSettingsHook
  } = useSNSLinks();

  const {
    storageInfo,
    initializeStorage
  } = useStorage();

  // Local UI state
  const [activeTab, setActiveTab] = useState<'drill' | 'admin'>('drill');
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; fileName: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showSNSSettings, setShowSNSSettings] = useState(false);
  const [showCatalogPopup, setShowCatalogPopup] = useState(false);
  const [isLanguageMenuOpen, setIsLanguageMenuOpen] = useState(false);

  // PDF Settings/Edit
  const [showPDFSettings, setShowPDFSettings] = useState<{ id: string; fileName: string; subjectId?: string } | null>(null);
  const [subjectsList, setSubjectsList] = useState<SubjectInfo[]>([]);
  const [subjectLoading, setSubjectLoading] = useState(false);

  const [showGradingHistory, setShowGradingHistory] = useState(false);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);
  const [showTermsOfService, setShowTermsOfService] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [showStorageInfo, setShowStorageInfo] = useState(false);
  const [snsTimeLimit, setSnsTimeLimit] = useState<number>(60); // デフォルト60分
  const [snsTimeLimitInput, setSnsTimeLimitInput] = useState<string>('60'); // 入力フィールド用
  const [notificationEnabled, setNotificationEnabled] = useState<boolean>(false); // 通知の有効/無効
  const [isPremium, setIsPremium] = useState<boolean>(false); // プレミアム権限

  // Load data on mount
  useEffect(() => {
    loadPDFRecords();
    loadSNSLinks();
    initializeStorage();
    loadSettings();
    loadSubjects(); // Load subjects
    // 通知許可状態をチェック
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  }, []);

  // Load subject list
  const loadSubjects = async () => {
    try {
      setSubjectLoading(true);
      const response = await getSubjects();
      setSubjectsList(response.subjects);
      console.log('📚 Loaded subjects:', response.subjects);
    } catch (error) {
      console.error('Failed to load subjects:', error);
    } finally {
      setSubjectLoading(false);
    }
  };

  // 設定を読み込む
  const loadSettings = async () => {
    try {
      const settings = await getAppSettings();
      // プレミアム権限チェック
      const premium = settings.isPremium || false;
      setIsPremium(premium);

      // 時間制限: プレミアムでない場合は強制的に60分、プレミアムなら保存された値（なければデフォルト60分）
      // ただし、すでに保存されている値が30分で、今回プレミアム制限が入った場合でも、ユーザー体験としては「60分に戻る」べき。
      // なので !premium なら 60 固定表示に近い挙動にするが、DB値を勝手に書き換えるかは別。
      // ここでは表示の初期値を決定する。

      const savedTime = settings.snsTimeLimitMinutes || 60;
      // プレミアムでなければ60分固定
      const effectiveTime = premium ? savedTime : 60;

      setSnsTimeLimit(effectiveTime);
      setSnsTimeLimitInput(String(effectiveTime));
      setNotificationEnabled(settings.notificationEnabled);
    } catch (error) {
      console.error('Failed to load settings:', error);
      // エラーの場合はデフォルト値を使用
      setSnsTimeLimit(60);
      setSnsTimeLimitInput('60');
      setNotificationEnabled(false);
      // データベースを再作成する必要がある場合
      if (error instanceof Error && error.message.includes('object stores was not found')) {
        console.log('⚠️ データベースの再作成が必要です。ブラウザをリロードしてください。');
      }
    }
  };

  // ストレージをクリアする（確認なし、自動更新）
  const clearAllStorage = async () => {
    try {
      // IndexedDBを削除
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('TutoTutoDB');
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('データベースの削除に失敗しました'));
      });

      // データを再読み込み（空になる）
      await loadPDFRecords();
      await loadSNSLinks();

      // ストレージ情報ダイアログを閉じる
      setShowStorageInfo(false);
    } catch (error) {
      console.error('ストレージのクリアに失敗:', error);
      setErrorMessage('ストレージのクリアに失敗しました: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  // 削除を確定
  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    await handleDeleteRecord(deleteConfirm.id);
    setDeleteConfirm(null);
  };

  // 言語切り替え
  const toggleLanguage = () => {
    const newLang = i18n.language === 'ja' ? 'en' : 'ja';
    i18n.changeLanguage(newLang);
    localStorage.setItem('language', newLang);
  };

  // SNS設定を保存
  const saveSNSSettings = async () => {
    try {
      await saveSNSSettingsHook();
      // 時間制限設定も保存
      await saveAppSettings({
        id: 'app-settings',
        snsTimeLimitMinutes: snsTimeLimit,
        notificationEnabled: notificationEnabled,
        isPremium: isPremium
      });
      setShowSNSSettings(false);
    } catch (error) {
      console.error('Failed to save SNS settings:', error);
      setErrorMessage('Failed to save SNS settings');
    }
  };



  // 通知許可をリクエスト
  const requestNotificationPermission = async () => {
    // PWAとしてインストールされているかチェック（iOS/iPadOSでは必須）
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as any).standalone
      || document.referrer.includes('android-app://');

    if (!('Notification' in window)) {
      if (!isStandalone) {
        alert('通知を使用するには、このアプリをホーム画面に追加してください。\n\n手順:\n1. Safariの共有ボタン（↑）をタップ\n2. 「ホーム画面に追加」を選択\n3. ホーム画面のアイコンから起動');
      } else {
        alert('このブラウザは通知をサポートしていません');
      }
      return;
    }

    try {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);

      if (permission === 'granted') {
        // テスト通知を送信
        new Notification('TutoTuto', {
          body: '通知が有効になりました！時間切れの際にお知らせします。',
          icon: '/pwa-192x192.png'
        });
      }
    } catch (error) {
      console.error('通知許可のリクエストに失敗しました:', error);
      alert('通知の許可に失敗しました。このアプリをホーム画面に追加してから再度お試しください。');
    }
  };

  // Merge error messages
  const currentError = errorMessage || pdfError;

  if (loading) {
    return (
      <div className="admin-container">
        <div className="loading-container">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {uploading && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          color: 'white',
          fontSize: '20px',
          flexDirection: 'column',
          gap: '20px'
        }}>
          <div style={{ fontSize: '48px' }}>⏳</div>
          <div>Loading PDF...</div>
          <div style={{ fontSize: '14px', color: '#ccc' }}>Please wait</div>
        </div>
      )}

      {deleteConfirm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#2c3e50', fontSize: '20px' }}>
              Confirm Delete
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#7f8c8d', fontSize: '14px' }}>
              <strong>{deleteConfirm.fileName}</strong><br />
              Delete this PDF and all drawings?
            </p>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {showSNSSettings && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            maxWidth: '500px',
            maxHeight: '80vh',
            width: '90%',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* ヘッダー（固定） */}
            <div style={{ padding: '24px 24px 16px 24px', borderBottom: '1px solid #ecf0f1' }}>
              <h3 style={{ margin: '0 0 8px 0', color: '#2c3e50', fontSize: '20px' }}>
                {t('snsSettings.title')}
              </h3>
              <p style={{ margin: 0, color: '#7f8c8d', fontSize: '14px' }}>
                {t('snsSettings.description')}
              </p>
            </div>

            {/* SNSリスト（スクロール可能） */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '16px 24px'
            }}>
              {/* 時間制限設定 & 通知設定 統合セクション */}
              <div style={{
                marginBottom: '20px',
                padding: '16px',
                border: '2px solid #3498db',
                borderRadius: '8px',
                backgroundColor: '#f0f8ff'
              }}>
                {/* 1行目: 時間制限 */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: '16px'
                }}>
                  <label style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#2c3e50',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span>⏱️</span>
                    <span>{t('snsSettings.timeLimit')}</span>
                  </label>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="number"
                        min="1"
                        max="120"
                        value={snsTimeLimitInput}
                        disabled={!isPremium}
                        onChange={(e) => setSnsTimeLimitInput(e.target.value)}
                        onBlur={(e) => {
                          const value = parseInt(e.target.value);
                          if (isNaN(value) || value < 1) {
                            setSnsTimeLimit(1);
                            setSnsTimeLimitInput('1');
                          } else if (value > 120) {
                            setSnsTimeLimit(120);
                            setSnsTimeLimitInput('120');
                          } else {
                            setSnsTimeLimit(value);
                            setSnsTimeLimitInput(String(value));
                          }
                        }}
                        style={{
                          width: '60px',
                          padding: '6px',
                          fontSize: '16px',
                          border: '2px solid #bdc3c7',
                          borderRadius: '6px',
                          textAlign: 'center',
                          backgroundColor: !isPremium ? '#ecf0f1' : 'white',
                          color: !isPremium ? '#95a5a6' : 'black',
                          cursor: !isPremium ? 'not-allowed' : 'text'
                        }}
                      />
                      <span style={{ fontSize: '14px', color: '#7f8c8d' }}>{t('snsSettings.minutes')}</span>
                    </div>
                    {!isPremium && (
                      <div style={{ fontSize: '10px', color: '#e74c3c' }}>
                        🔒 Default: 60 min. Unlock to change.
                      </div>
                    )}
                  </div>
                </div>

                {/* 2行目: 通知トグル */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingTop: '12px',
                  borderTop: '1px solid #dcdcdc'
                }}>
                  <label style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#2c3e50',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span>🔔</span>
                    <span>{t('snsSettings.notificationEnable')}</span>
                  </label>

                  {/* トグルスイッチ */}
                  <div
                    onClick={async () => {
                      const newValue = !notificationEnabled;
                      if (newValue) {
                        await requestNotificationPermission();
                        // ユーザーが拒否した場合はONにしない
                        if (Notification.permission === 'granted') {
                          setNotificationEnabled(true);
                        }
                      } else {
                        setNotificationEnabled(false);
                      }
                    }}
                    style={{
                      width: '44px',
                      height: '24px',
                      backgroundColor: notificationEnabled ? '#27ae60' : '#bdc3c7',
                      borderRadius: '12px',
                      position: 'relative',
                      transition: 'background-color 0.2s ease',
                      cursor: 'pointer',
                      flexShrink: 0
                    }}
                  >
                    <div style={{
                      width: '18px',
                      height: '18px',
                      backgroundColor: 'white',
                      borderRadius: '50%',
                      position: 'absolute',
                      top: '3px',
                      left: notificationEnabled ? '23px' : '3px',
                      transition: 'left 0.2s ease',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                    }} />
                  </div>
                </div>

                {/* 通知許可状態の警告表示 (必要な場合のみ) */}
                {notificationEnabled && notificationPermission === 'denied' && (
                  <div style={{ marginTop: '8px', fontSize: '11px', color: '#e74c3c' }}>
                    ⚠️ ブラウザの通知がブロックされています。設定を確認してください。
                  </div>
                )}
              </div>

              {PREDEFINED_SNS.map((sns) => {
                const isSelected = selectedSNS.has(sns.id);
                const snsIcon = getSNSIcon(sns.id);
                const iconColor = snsIcon?.color || '#3498db';

                return (
                  <div key={sns.id} style={{
                    marginBottom: '12px',
                    padding: '12px',
                    border: `2px solid ${isSelected ? iconColor : '#e0e0e0'}`,
                    borderRadius: '8px',
                    backgroundColor: isSelected ? '#f0f8ff' : 'white',
                    transition: 'all 0.2s ease'
                  }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer'
                    }}>
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSNS(sns.id)}
                        style={{
                          width: '20px',
                          height: '20px',
                          cursor: 'pointer'
                        }}
                      />
                      {snsIcon ? (
                        <div
                          style={{
                            width: '32px',
                            height: '32px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          dangerouslySetInnerHTML={{ __html: snsIcon.svg }}
                        />
                      ) : (
                        <span style={{ fontSize: '24px' }}>{sns.icon}</span>
                      )}
                      <span style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: '#2c3e50',
                        flex: 1
                      }}>
                        {sns.name}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>

            {/* フッター（固定） */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid #ecf0f1',
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setShowSNSSettings(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {t('snsSettings.cancel')}
              </button>
              <button
                onClick={saveSNSSettings}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {t('snsSettings.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showHelp && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '600px',
            maxHeight: '80vh',
            width: '90%',
            overflow: 'auto'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#2c3e50', fontSize: '20px' }}>
              {t('howToUse.title')}
            </h3>

            {/* Step 1: PDF登録 */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#3498db', fontSize: '16px' }}>
                {t('howToUse.step1.title')}
              </h4>
              <ul style={{ margin: '0 0 12px 0', paddingLeft: '1em', listStyle: 'none', color: '#7f8c8d', fontSize: '14px', lineHeight: '1.8' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <FaEarthAmericas style={{ fontSize: '16px', color: '#3498db' }} />
                  </span>
                  →
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <ImFilePdf style={{ fontSize: '16px', color: '#e74c3c' }} />
                  </span>
                  →
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <IoIosFolderOpen style={{ fontSize: '16px', color: '#f39c12' }} />
                  </span>
                  {t('howToUse.step1.catalog')}
                </li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <IoIosFolderOpen style={{ fontSize: '16px', color: '#f39c12' }} />
                  </span>
                  →
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <ImFilePdf style={{ fontSize: '16px', color: '#e74c3c' }} />
                  </span>
                  →
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    <VscDatabase style={{ fontSize: '16px', color: '#34495e' }} />
                  </span>
                  {t('howToUse.step1.local')}
                </li>
              </ul>
            </div>

            {/* Step 2: SNS制限 */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#3498db', fontSize: '16px' }}>
                {t('howToUse.step2.title')}
              </h4>
              <ul style={{ margin: '0 0 12px 0', paddingLeft: '1em', listStyle: 'none', color: '#7f8c8d', fontSize: '14px', lineHeight: '1.8' }}>
                <li>{t('howToUse.step2.line1')}</li>
                <li>{t('howToUse.step2.line2')}</li>
                <li>{t('howToUse.step2.line3')}</li>
              </ul>
            </div>

            {/* Step 3: 学習 */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#3498db', fontSize: '16px' }}>
                {t('howToUse.step3.title')}
              </h4>
              <ul style={{ margin: '0 0 12px 0', paddingLeft: '1em', listStyle: 'none', color: '#7f8c8d', fontSize: '14px', lineHeight: '1.8' }}>
                <li>{t('howToUse.step3.line1')}</li>
                <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {ICON_SVG.pen(true, '#000000')}
                  </span>
                  <strong>{t('howToUse.step3.line2Pen')}</strong>{t('howToUse.step3.line2Write')}
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {ICON_SVG.eraser(true)}
                  </span>
                  <strong>{t('howToUse.step3.line2Eraser')}</strong>{t('howToUse.step3.line2Erase')}
                </li>
                <li>{t('howToUse.step3.line3')}</li>
                <li>{t('howToUse.step3.line4')}</li>
              </ul>
            </div>

            {/* Step 4: 採点 */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#3498db', fontSize: '16px' }}>
                {t('howToUse.step4.title')}
              </h4>
              <ul style={{ margin: '0 0 12px 0', paddingLeft: '1em', listStyle: 'none', color: '#7f8c8d', fontSize: '14px', lineHeight: '1.8' }}>
                <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <strong>{t('howToUse.step4.line1')}</strong> {t('howToUse.step4.line1Tap')}
                </li>
                <li>{t('howToUse.step4.line2')}</li>
                <li>{t('howToUse.step4.line3')}</li>
                <li>{t('howToUse.step4.line4')}</li>
              </ul>
              <p style={{ margin: '0', padding: '8px', backgroundColor: '#fff3cd', borderRadius: '4px', fontSize: '12px', color: '#856404', lineHeight: '1.5' }}>
                {t('howToUse.step4.warning')}
              </p>
            </div>

            {/* Step 5: その他 */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#3498db', fontSize: '16px' }}>
                {t('howToUse.step5.title')}
              </h4>
              <ul style={{ margin: 0, paddingLeft: '1em', listStyle: 'none', color: '#7f8c8d', fontSize: '14px', lineHeight: '1.8' }}>
                <li>{t('howToUse.step5.history')}</li>
                <li>{t('howToUse.step5.storage')}</li>
                <li>{t('howToUse.step5.delete')}</li>
              </ul>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowHelp(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                {t('howToUse.closeButton')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showStorageInfo && storageInfo && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#2c3e50', fontSize: '20px' }}>
              {t('storage.title')}
            </h3>

            <div style={{ marginBottom: '20px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '8px',
                fontSize: '14px',
                color: '#7f8c8d'
              }}>
                <span>{t('storage.usage')}:</span>
                <span style={{ fontWeight: '600', color: '#2c3e50' }}>
                  {storageInfo.usageMB.toFixed(2)} MB / {storageInfo.quotaMB.toFixed(0)} MB
                </span>
              </div>

              <div style={{
                width: '100%',
                height: '8px',
                backgroundColor: '#ecf0f1',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.min(storageInfo.usagePercent, 100)}%`,
                  height: '100%',
                  backgroundColor: storageInfo.usagePercent > 80 ? '#e74c3c' : storageInfo.usagePercent > 50 ? '#f39c12' : '#27ae60',
                  transition: 'width 0.3s ease'
                }} />
              </div>

              <div style={{
                marginTop: '8px',
                fontSize: '12px',
                color: '#95a5a6',
                textAlign: 'right'
              }}>
                {storageInfo.usagePercent.toFixed(1)}% {t('storage.used')}
              </div>
            </div>

            <div style={{
              padding: '12px',
              backgroundColor: storageInfo.isPersisted ? '#d4edda' : '#fff3cd',
              border: `1px solid ${storageInfo.isPersisted ? '#c3e6cb' : '#ffeeba'}`,
              borderRadius: '6px',
              marginBottom: '20px'
            }}>
              <div style={{
                fontSize: '14px',
                fontWeight: '600',
                color: storageInfo.isPersisted ? '#155724' : '#856404',
                marginBottom: '4px'
              }}>
                {storageInfo.isPersisted ? t('storage.protected') : t('storage.notProtected')}
              </div>
              <div style={{
                fontSize: '12px',
                color: storageInfo.isPersisted ? '#155724' : '#856404',
                lineHeight: '1.5'
              }}>
                {storageInfo.isPersisted
                  ? t('storage.protectedMessage')
                  : getPlatformInfo().isIOS && !getPlatformInfo().isPWA
                    ? t('storage.notProtectedMessageIOS')
                    : t('storage.notProtectedMessageOther')}
              </div>
            </div>

            {/* 広告: サイドバー */}
            <AdSlot slot="admin-sidebar" />

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
              <button
                onClick={clearAllStorage}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#e74c3c',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#c0392b'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#e74c3c'}
              >
                {t('storage.deleteAll')}
              </button>
              <button
                onClick={() => setShowStorageInfo(false)}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#2980b9'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#3498db'}
              >
                {t('storage.close')}
              </button>
            </div>
          </div>
        </div>
      )}



      {currentError && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '12px',
            padding: '24px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#e74c3c', fontSize: '20px' }}>
              Error
            </h3>
            <p style={{ margin: '0 0 24px 0', color: '#7f8c8d', fontSize: '14px' }}>
              {currentError}
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => {
                  setErrorMessage(null);
                  setPdfError(null);
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="admin-container">
        {/* 言語切り替えドロップダウン */}
        <div style={{
          position: 'absolute',
          top: '20px',
          right: '80px',
          zIndex: 100
        }}>
          <button
            onClick={() => setIsLanguageMenuOpen(!isLanguageMenuOpen)}
            style={{
              padding: '8px 16px',
              backgroundColor: '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: '20px',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              height: '40px'
            }}
          >
            {i18n.language === 'ja' ? '日本語' : 'English'}
            <span style={{ fontSize: '10px' }}>▼</span>
          </button>

          {isLanguageMenuOpen && (
            <div style={{
              position: 'absolute',
              top: '110%',
              right: 0,
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              border: '1px solid #ecf0f1',
              minWidth: '120px',
              overflow: 'hidden'
            }}>
              <button
                onClick={() => {
                  i18n.changeLanguage('ja');
                  localStorage.setItem('language', 'ja');
                  setIsLanguageMenuOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 16px',
                  backgroundColor: i18n.language === 'ja' ? '#f0f8ff' : 'white',
                  color: '#2c3e50',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                日本語
              </button>
              <button
                onClick={() => {
                  i18n.changeLanguage('en');
                  localStorage.setItem('language', 'en');
                  setIsLanguageMenuOpen(false);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '10px 16px',
                  backgroundColor: i18n.language === 'en' ? '#f0f8ff' : 'white',
                  color: '#2c3e50',
                  border: 'none',
                  borderTop: '1px solid #ecf0f1',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
              >
                English
              </button>
            </div>
          )}
        </div>

        <button className="help-button" onClick={() => setShowHelp(true)} title="Help">
          ?
        </button>
        <div className="admin-header">
          {/* 開発モードと本番モードでパスを切り替え */}
          <div className="logo-container">
            <img
              src={import.meta.env.DEV
                ? `/icons/${import.meta.env.MODE}/logo.png`
                : `${import.meta.env.BASE_URL}logo.png`}
              alt="Tuto Tuto"
              className="app-logo"
            />
            <span className="logo-text">TutoTuto</span>
          </div>

          {/* タブ切り替え */}
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'center',
            marginTop: '20px'
          }}>
            <button
              onClick={() => setActiveTab('drill')}
              style={{
                padding: '12px 24px',
                backgroundColor: activeTab === 'drill' ? '#3498db' : 'white',
                color: activeTab === 'drill' ? 'white' : '#2c3e50',
                border: `2px solid #3498db`,
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span style={{ fontSize: '20px' }}>🖊️</span>
              Study
            </button>
            <button
              onClick={() => setActiveTab('admin')}
              style={{
                padding: '12px 24px',
                backgroundColor: activeTab === 'admin' ? '#3498db' : 'white',
                color: activeTab === 'admin' ? 'white' : '#2c3e50',
                border: `2px solid #3498db`,
                borderRadius: '12px',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                position: 'relative'
              }}
            >
              <span style={{ fontSize: '20px' }}>⚙️</span>
              Admin
              {hasUpdate && (
                <span style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-4px',
                  width: '12px',
                  height: '12px',
                  backgroundColor: '#e67e22',
                  borderRadius: '50%',
                  border: '2px solid white'
                }} />
              )}
            </button>
          </div>
        </div>

        {/* ドリルモード: PDFリストのみ */}
        {activeTab === 'drill' && (
          <div style={{ padding: '20px' }}>
            <h2 className="section-title">PDF Files</h2>

            {pdfRecords.length === 0 ? (
              <div className="empty-state">
                <p>No PDF files yet</p>
              </div>
            ) : (
              <div className="pdf-list">
                {pdfRecords.map((record) => (
                  <div
                    key={record.id}
                    className="pdf-list-item"
                    onClick={() => onSelectPDF(record)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
                      {/* Subject icon on the left */}
                      {record.subjectId && (
                        <div style={{
                          fontSize: '28px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: '40px',
                          flexShrink: 0
                        }}>
                          {(() => {
                            const subject = subjectsList.find(s => s.id === record.subjectId);
                            if (record.subjectId === 'japanese') {
                              return <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f1ef-1f1f5.png" alt="🇯🇵" style={{ width: '32px', height: '32px' }} />;
                            }
                            if (record.subjectId === 'english') {
                              return <img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/1f1ec-1f1e7.png" alt="🇬🇧" style={{ width: '32px', height: '32px' }} />;
                            }
                            return subject?.icon || '📚';
                          })()}
                        </div>
                      )}

                      {/* Thumbnail */}
                      <div className="icon-container" style={{
                        width: '64px',
                        height: '64px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {record.thumbnail ? (
                          <img
                            src={record.thumbnail}
                            alt={record.fileName}
                            style={{
                              maxWidth: '64px',
                              maxHeight: '64px',
                              objectFit: 'contain',
                              borderRadius: '4px',
                              border: '1px solid #ddd'
                            }}
                          />
                        ) : (
                          <svg
                            width="32"
                            height="32"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#e74c3c"
                            strokeWidth="2"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                            <polyline points="10 9 9 9 8 9" />
                          </svg>
                        )}
                      </div>

                      {/* File name */}
                      <div className="file-name">
                        {record.fileName}
                      </div>
                    </div>

                    {/* Settings Button */}
                    <button
                      className="settings-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowPDFSettings({
                          id: record.id,
                          fileName: record.fileName,
                          subjectId: record.subjectId
                        });
                      }}
                      title="設定"
                      style={{ color: '#95a5a6' }}
                    >
                      <IoMdSettings style={{ fontSize: '20px' }} />
                    </button>

                    {/* 削除ボタン */}
                    <button
                      className="delete-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ id: record.id, fileName: record.fileName });
                      }}
                      title="削除"
                      style={{ color: '#95a5a6' }}
                    >
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        <line x1="10" y1="11" x2="10" y2="17" />
                        <line x1="14" y1="11" x2="14" y2="17" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}



            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '20px',
              marginTop: '20px'
            }}>
              {/* Catalog Button (外部サイトからダウンロード) */}
              <button
                className="add-button"
                onClick={() => setShowCatalogPopup(true)}
                style={{ width: '100%', margin: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '12px', height: 'auto', padding: '20px 24px', background: 'white', border: '2px solid #bdc3c7', borderRadius: '8px' }}
                title="おすすめ無料教材サイト"
              >
                <FaEarthAmericas style={{ fontSize: '32px', color: '#3498db' }} />
                <div style={{ fontSize: '24px', color: '#2c3e50' }}>→</div>
                <ImFilePdf style={{ fontSize: '32px', color: '#e74c3c' }} />
                <div style={{ fontSize: '24px', color: '#2c3e50' }}>→</div>
                <IoIosFolderOpen style={{ fontSize: '32px', color: '#f39c12' }} />
              </button>

              {/* Local Import Button (ローカルファイルを登録) */}
              <button
                className="add-button"
                onClick={() => handleFileSelect()}
                style={{ width: '100%', margin: 0, display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '12px', height: 'auto', padding: '20px 24px', background: 'white', border: '2px solid #bdc3c7', borderRadius: '8px' }}
                title="ローカルファイルを登録"
              >
                <IoIosFolderOpen style={{ fontSize: '32px', color: '#f39c12' }} />
                <div style={{ fontSize: '24px', color: '#2c3e50' }}>→</div>
                <ImFilePdf style={{ fontSize: '32px', color: '#e74c3c' }} />
                <div style={{ fontSize: '24px', color: '#2c3e50' }}>→</div>
                <VscDatabase style={{ fontSize: '32px', color: '#34495e' }} />
              </button>
            </div>
          </div >
        )
        }

        {/* Catalog Popup Modal */}
        {
          showCatalogPopup && (
            <div style={{
              position: 'fixed',
              top: 0,
              left: 0,
              width: '100vw',
              height: '100vh',
              backgroundColor: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 10000
            }} onClick={() => setShowCatalogPopup(false)}>
              <div style={{
                backgroundColor: 'white',
                borderRadius: '12px',
                padding: '20px',
                maxWidth: '90vw',
                maxHeight: '80vh',
                overflow: 'auto',
                boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
                position: 'relative'
              }} onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => setShowCatalogPopup(false)}
                  style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    background: 'none',
                    border: 'none',
                    fontSize: '24px',
                    cursor: 'pointer',
                    color: '#7f8c8d'
                  }}
                  title="閉じる"
                >
                  ✕
                </button>
                <DrillCatalog addPDF={addPDF} />
              </div>
            </div>
          )
        }

        {/* 管理モード: SNS設定、ストレージ情報、採点履歴、広告 */}
        {
          activeTab === 'admin' && (
            <div style={{ padding: '20px' }}>
              {/* 広告: 上部バナー */}
              <AdSlot slot="admin-top" />

              {/* 新しいバージョン通知（最優先表示） */}
              {hasUpdate && (
                <div style={{
                  backgroundColor: '#fff3e0',
                  border: '2px solid #e67e22',
                  borderRadius: '12px',
                  padding: '16px',
                  marginBottom: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  boxShadow: '0 2px 4px rgba(230, 126, 34, 0.2)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>✨</span>
                    <div>
                      <h3 style={{ margin: '0 0 4px 0', color: '#d35400', fontSize: '16px', fontWeight: 'bold' }}>
                        New Version Available!
                      </h3>
                      <p style={{ margin: 0, color: '#e67e22', fontSize: '14px' }}>
                        タップしてアプリを更新してください
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={onUpdate}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#e67e22',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                    }}
                  >
                    更新する
                  </button>
                </div>
              )}

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
                gap: '20px',
                marginTop: '20px'
              }}>
                {/* 採点履歴カード */}
                <button
                  onClick={() => setShowGradingHistory(true)}
                  style={{
                    width: '100%',
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '20px',
                    border: '2px solid #ecf0f1',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#2c3e50',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#9b59b6';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#ecf0f1';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  title="採点履歴を表示"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>🕒</span>
                    <span>History</span>
                  </div>
                  <span style={{ fontSize: '20px', opacity: 0.5 }}>↗</span>
                </button>


                {/* ストレージ情報カード */}
                {storageInfo && (
                  <div style={{
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '20px',
                    border: '2px solid #ecf0f1'
                  }}>
                    <button
                      onClick={() => setShowStorageInfo(true)}
                      style={{
                        width: '100%',
                        backgroundColor: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        fontSize: '18px',
                        fontWeight: '600',
                        color: '#2c3e50',
                        marginBottom: '12px',
                        transition: 'color 0.2s'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = '#3498db';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = '#2c3e50';
                      }}
                      title="ストレージ詳細を表示"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ fontSize: '24px' }}>💾</span>
                        <span>Storage</span>
                      </div>
                      <span style={{ fontSize: '20px', opacity: 0.5 }}>↗</span>
                    </button>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '14px',
                      color: '#7f8c8d'
                    }}>
                      <span>Usage:</span>
                      <span style={{ fontWeight: '600', color: '#2c3e50' }}>
                        {storageInfo.usageMB.toFixed(2)} MB / {storageInfo.quotaMB.toFixed(0)} MB
                      </span>
                    </div>
                  </div>
                )}

                {/* SNS Links Section - Merged with Notification */}
                <button
                  onClick={() => setShowSNSSettings(true)}
                  style={{
                    width: '100%',
                    backgroundColor: 'white',
                    borderRadius: '12px',
                    padding: '20px',
                    border: '2px solid #ecf0f1',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    fontSize: '18px',
                    fontWeight: '600',
                    color: '#2c3e50',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#27ae60';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#ecf0f1';
                    e.currentTarget.style.transform = 'translateY(0)';
                  }}
                  title="リンクと通知の設定"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '24px' }}>❤️</span>
                    <span>Links & Notification</span>
                  </div>
                  <span style={{ fontSize: '20px', opacity: 0.5 }}>↗</span>
                </button>
              </div>

              {/* 広告: 下部 */}
              <div style={{ marginTop: '20px' }}>
                <AdSlot slot="admin-sidebar" />
              </div>
            </div>
          )
        }
      </div >

      {/* フッター */}
      < footer style={{
        padding: '16px 20px',
        backgroundColor: '#f8f9fa',
        borderTop: '1px solid #ecf0f1',
        textAlign: 'center'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '16px',
          flexWrap: 'wrap',
          fontSize: '13px'
        }}>
          <button
            onClick={() => setShowAbout(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#7f8c8d',
              cursor: 'pointer',
              padding: 0,
              fontSize: '13px',
              textDecoration: 'underline'
            }}
          >
            TutoTutoについて
          </button>
          <button
            onClick={() => setShowContact(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#7f8c8d',
              cursor: 'pointer',
              padding: 0,
              fontSize: '13px',
              textDecoration: 'underline'
            }}
          >
            お問い合わせ
          </button>
          <button
            onClick={() => setShowPrivacyPolicy(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#7f8c8d',
              cursor: 'pointer',
              padding: 0,
              fontSize: '13px',
              textDecoration: 'underline'
            }}
          >
            プライバシーポリシー
          </button>
          <button
            onClick={() => setShowTermsOfService(true)}
            style={{
              background: 'none',
              border: 'none',
              color: '#7f8c8d',
              cursor: 'pointer',
              padding: 0,
              fontSize: '13px',
              textDecoration: 'underline'
            }}
          >
            利用規約
          </button>
        </div>
        <div style={{
          marginTop: '8px',
          fontSize: '11px',
          color: '#95a5a6'
        }}>
          © 2026 TutoTuto
        </div>
      </footer >

      {/* 採点履歴モーダル */}
      {
        showGradingHistory && (
          <GradingHistory
            onClose={() => setShowGradingHistory(false)}
          />
        )
      }

      {/* プライバシーポリシーモーダル */}
      {
        showPrivacyPolicy && (
          <PrivacyPolicy onClose={() => setShowPrivacyPolicy(false)} />
        )
      }

      {/* 利用規約モーダル */}
      {
        showTermsOfService && (
          <TermsOfService onClose={() => setShowTermsOfService(false)} />
        )
      }

      {/* 運営者情報モーダル */}
      {
        showAbout && (
          <About onClose={() => setShowAbout(false)} />
        )
      }

      {/* お問い合わせモーダル */}
      {
        showContact && (
          <Contact onClose={() => setShowContact(false)} />
        )
      }

      {/* PDF Settings Modal */}
      {
        showPDFSettings && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10001
          }} onClick={() => setShowPDFSettings(null)}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '500px',
              width: '90%'
            }} onClick={(e) => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0', color: '#2c3e50', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <IoMdSettings />
                <span>ドリル設定</span>
              </h3>

              <div style={{ marginBottom: '20px' }}>
                <p style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#7f8c8d' }}>
                  ファイル名:
                </p>
                <div style={{ fontWeight: 'bold', overflowWrap: 'break-word', color: '#2c3e50' }}>
                  {showPDFSettings.fileName}
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#7f8c8d', fontWeight: 'bold' }}>
                  教科
                </label>
                {subjectLoading ? (
                  <div>読み込み中...</div>
                ) : (
                  <select
                    value={showPDFSettings.subjectId || ""}
                    onChange={(e) => setShowPDFSettings({ ...showPDFSettings, subjectId: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #bdc3c7',
                      fontSize: '16px',
                      backgroundColor: 'white'
                    }}
                  >
                    <option value="">自動(未設定)</option>
                    {subjectsList.map(subject => (
                      <option key={subject.id} value={subject.id}>
                        {subject.icon} {subject.labels[i18n.language] || subject.labels['en'] || subject.id}
                      </option>
                    ))}
                  </select>
                )}
                <p style={{ fontSize: '12px', color: '#95a5a6', marginTop: '8px' }}>
                  採点時にこの教科のプロンプトが使用されます。
                </p>
              </div>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setShowPDFSettings(null)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#95a5a6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  キャンセル
                </button>
                <button
                  onClick={async () => {
                    try {
                      const newRecord = { ...showPDFSettings };
                      await updatePDFRecord(newRecord.id, { subjectId: newRecord.subjectId !== "" ? newRecord.subjectId : undefined });
                      await loadPDFRecords(); // Reload list
                      setShowPDFSettings(null);
                    } catch (e) {
                      console.error(e);
                      alert('設定の更新に失敗しました');
                    }
                  }}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: '#3498db',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        )
      }
    </>
  );
}
