import React from 'react';
import './Legal.css';

interface PrivacyPolicyProps {
  onClose: () => void;
}

const PrivacyPolicy: React.FC<PrivacyPolicyProps> = ({ onClose }) => {
  return (
    <div className="legal-modal-overlay" onClick={onClose}>
      <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="legal-modal-header">
          <h2>🔒 プライバシーポリシー</h2>
          <button className="legal-modal-close" onClick={onClose} title="閉じる">
            ✕
          </button>
        </div>

        <div className="legal-modal-content">
          <p className="legal-last-updated">最終更新日: 2026年1月6日</p>

          <p>
            TutoTuto（以下「本アプリ」）は、お客様のプライバシーを尊重し、個人情報の保護に努めています。
            本プライバシーポリシーでは、本アプリにおける情報の取り扱いについて説明します。
          </p>

          <h3>1. 収集する情報</h3>
          <p>本アプリは、以下の情報をお客様のデバイス内にのみ保存します：</p>
          <ul>
            <li>PDFファイル（学習用教材として登録されたもの）</li>
            <li>手書きの書き込みデータ</li>
            <li>採点履歴</li>
            <li>アプリ設定（SNS利用時間制限、通知設定など）</li>
          </ul>
          <p>
            <strong>これらの情報はすべてお客様のデバイス内（IndexedDB）に保存され、
            外部サーバーには送信されません。</strong>
          </p>

          <h3>2. AI採点機能について</h3>
          <p>
            本アプリのAI採点機能を利用する際、採点対象の画像データがGoogle Gemini APIに送信されます。
            送信されたデータは採点処理にのみ使用され、Googleのプライバシーポリシーに従って取り扱われます。
          </p>

          <h3>3. 広告について</h3>
          <p>
            本アプリでは、Google AdSenseを使用して広告を表示する場合があります。
            Google AdSenseは、Cookieを使用してお客様の興味に基づいた広告を表示することがあります。
          </p>
          <p>
            Googleによる広告配信については、
            <a href="https://policies.google.com/technologies/ads?hl=ja" target="_blank" rel="noopener noreferrer">
              Googleの広告ポリシー
            </a>
            をご確認ください。
          </p>

          <h3>4. Cookieの使用</h3>
          <p>
            本アプリでは、広告配信およびサービス改善のためにCookieを使用する場合があります。
            Cookieは、ブラウザの設定により無効にすることができます。
          </p>

          <h3>5. データの削除</h3>
          <p>
            本アプリに保存されたデータは、ブラウザの設定からサイトデータを削除するか、
            アプリ内の「すべて削除」機能を使用することで削除できます。
          </p>

          <h3>6. お問い合わせ</h3>
          <p>
            本プライバシーポリシーに関するお問い合わせは、以下までご連絡ください：
          </p>
          <p>
            <strong>メール:</strong> tututu.app@gmail.com
          </p>

          <h3>7. プライバシーポリシーの変更</h3>
          <p>
            本プライバシーポリシーは、必要に応じて変更されることがあります。
            変更があった場合は、本アプリ内で通知します。
          </p>
        </div>

        <div className="legal-modal-footer">
          <button onClick={onClose}>閉じる</button>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
