import React from 'react';
import './Legal.css';

interface AboutProps {
    onClose: () => void;
}

const About: React.FC<AboutProps> = ({ onClose }) => {
    return (
        <div className="legal-modal-overlay" onClick={onClose}>
            <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
                <div className="legal-modal-header">
                    <h2>🦉 TutoTutoについて</h2>
                    <button className="legal-modal-close" onClick={onClose} title="閉じる">
                        ✕
                    </button>
                </div>

                <div className="legal-modal-content">
                    <h3>TutoTutoとは</h3>
                    <p>
                        TutoTutoは、お子様の家庭学習をサポートするためのPWA（Progressive Web App）です。
                        PDF形式の教材に直接書き込みができ、AI技術を活用した自動採点機能により、
                        効率的な学習体験を提供します。
                    </p>

                    <h3>主な機能</h3>
                    <ul>
                        <li><strong>PDF教材の管理</strong> - 学習用のPDFファイルをアプリに登録して管理できます</li>
                        <li><strong>手書き書き込み</strong> - タッチペンや指で直接PDFに書き込みができます</li>
                        <li><strong>AI自動採点</strong> - Google Gemini AIを使用した自動採点機能</li>
                        <li><strong>オフライン対応</strong> - インターネット接続がなくても基本機能が使えます</li>
                        <li><strong>学習履歴</strong> - 採点結果の履歴を確認できます</li>
                    </ul>

                    <h3>対応デバイス</h3>
                    <p>以下のデバイス・ブラウザでご利用いただけます：</p>
                    <ul>
                        <li>iPad / iPhone（Safari）- Apple Pencil対応</li>
                        <li>Android タブレット / スマートフォン（Chrome）</li>
                        <li>Windows / Mac PC（Chrome, Edge, Safari）</li>
                    </ul>

                    <h3>開発・運営</h3>
                    <div style={{
                        backgroundColor: '#f8f9fa',
                        padding: '16px',
                        borderRadius: '8px',
                        margin: '16px 0'
                    }}>
                        <p style={{ margin: '0 0 8px 0' }}>
                            <strong>運営者:</strong> ThousandsOfTies
                        </p>
                        <p style={{ margin: '0 0 8px 0' }}>
                            <strong>メール:</strong>{' '}
                            <a href="mailto:thousands.of.ties@gmail.com" style={{ color: '#3498db' }}>
                                thousands.of.ties@gmail.com
                            </a>
                        </p>
                        <p style={{ margin: 0 }}>
                            <strong>GitHub:</strong>{' '}
                            <a
                                href="https://github.com/ThousandsOfTies"
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ color: '#3498db' }}
                            >
                                github.com/ThousandsOfTies
                            </a>
                        </p>
                    </div>

                    <h3>バージョン情報</h3>
                    <p>
                        <strong>現在のバージョン:</strong> 0.2.0
                    </p>

                    <h3>謝辞</h3>
                    <p>
                        TutoTutoは以下の技術・サービスを使用しています：
                    </p>
                    <ul>
                        <li>React - UIフレームワーク</li>
                        <li>Vite - ビルドツール</li>
                        <li>PDF.js - PDF表示ライブラリ</li>
                        <li>Google Gemini AI - 自動採点エンジン</li>
                    </ul>
                </div>

                <div className="legal-modal-footer">
                    <button onClick={onClose}>閉じる</button>
                </div>
            </div>
        </div>
    );
};

export default About;
