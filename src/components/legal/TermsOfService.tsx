import React from 'react';
import './Legal.css';

interface TermsOfServiceProps {
    onClose: () => void;
}

const TermsOfService: React.FC<TermsOfServiceProps> = ({ onClose }) => {
    return (
        <div className="legal-modal-overlay" onClick={onClose}>
            <div className="legal-modal" onClick={(e) => e.stopPropagation()}>
                <div className="legal-modal-header">
                    <h2>📋 利用規約</h2>
                    <button className="legal-modal-close" onClick={onClose} title="閉じる">
                        ✕
                    </button>
                </div>

                <div className="legal-modal-content">
                    <p className="legal-last-updated">最終更新日: 2026年1月6日</p>

                    <p>
                        この利用規約（以下「本規約」）は、TutoTuto（以下「本アプリ」）の利用条件を定めるものです。
                        本アプリをご利用いただく前に、本規約をよくお読みください。
                    </p>

                    <h3>1. サービスの説明</h3>
                    <p>
                        本アプリは、PDFファイルを使用した学習支援サービスです。
                        以下の機能を提供します：
                    </p>
                    <ul>
                        <li>PDFファイルの閲覧と管理</li>
                        <li>手書きによる書き込み機能</li>
                        <li>AIを使用した自動採点機能</li>
                        <li>学習進捗の管理</li>
                    </ul>

                    <h3>2. 利用条件</h3>
                    <p>本アプリを利用するにあたり、以下の条件に同意するものとします：</p>
                    <ul>
                        <li>本アプリを個人の学習目的でのみ使用すること</li>
                        <li>本規約およびプライバシーポリシーに同意すること</li>
                        <li>著作権法その他の法令を遵守すること</li>
                    </ul>

                    <h3>3. 禁止事項</h3>
                    <p>以下の行為を禁止します：</p>
                    <ul>
                        <li>本アプリを不正な目的で使用すること</li>
                        <li>本アプリのシステムに過度な負荷をかけること</li>
                        <li>本アプリのソースコードを無断で複製・改変・再配布すること</li>
                        <li>著作権で保護されたコンテンツを許可なくアップロードすること</li>
                        <li>他のユーザーまたは第三者の権利を侵害すること</li>
                    </ul>

                    <h3>4. 免責事項</h3>
                    <p>
                        本アプリは「現状有姿」で提供されます。
                        以下について、運営者は一切の責任を負いません：
                    </p>
                    <ul>
                        <li>本アプリの利用により生じた損害</li>
                        <li>AI採点機能の結果の正確性</li>
                        <li>データの損失または破損</li>
                        <li>本アプリの中断または終了</li>
                        <li>第三者によるアクセスまたは使用</li>
                    </ul>

                    <h3>5. 広告の表示</h3>
                    <p>
                        本アプリでは、Google AdSenseによる広告が表示される場合があります。
                        広告の内容は第三者によって提供されるものであり、
                        運営者はその内容について責任を負いません。
                    </p>

                    <h3>6. サービスの変更・終了</h3>
                    <p>
                        運営者は、事前の通知なく本アプリの内容を変更し、
                        または本アプリの提供を終了することができます。
                    </p>

                    <h3>7. 規約の変更</h3>
                    <p>
                        運営者は、必要に応じて本規約を変更することがあります。
                        変更後の規約は、本アプリ内に掲示した時点から効力を生じます。
                    </p>

                    <h3>8. 準拠法</h3>
                    <p>
                        本規約は、日本法に準拠し、解釈されるものとします。
                    </p>

                    <h3>9. お問い合わせ</h3>
                    <p>
                        本規約に関するお問い合わせは、以下までご連絡ください：
                    </p>
                    <p>
                        <strong>メール:</strong> thousands.of.ties@gmail.com
                    </p>
                </div>

                <div className="legal-modal-footer">
                    <button onClick={onClose}>閉じる</button>
                </div>
            </div>
        </div>
    );
};

export default TermsOfService;
