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
                        本アプリは、お子様のSNS利用を制限し、学習習慣を促進するためのペアレンタルコントロールアプリです。
                        SNSへのアクセスを許可する前に、本アプリでの学習を条件として設定することができます。
                        学習機能として以下を提供します：
                    </p>
                    <ul>
                        <li>PDFファイルの閲覧と管理</li>
                        <li>手書きによる書き込み機能</li>
                        <li>AIを使用した自動採点機能</li>
                        <li>学習進捗の管理</li>
                        <li>採点後の時間制限付きSNSアクセス許可機能</li>
                    </ul>

                    <h3>2. 利用条件</h3>
                    <p>本アプリを利用するにあたり、以下の条件に同意するものとします：</p>
                    <ul>
                        <li>保護者によるお子様の学習管理およびSNS利用制限の目的で使用すること</li>
                        <li>本規約およびプライバシーポリシーに同意すること</li>
                        <li>著作権法その他の法令を遵守すること</li>
                    </ul>

                    <h3>3. 禁止事項</h3>
                    <p>以下の行為を禁止します：</p>
                    <ul>
                        <li>本アプリを不正な目的で使用すること</li>
                        <li>本アプリのシステムに過度な負荷をかけること</li>
                        <li>AI採点機能を短時間に過度に利用すること（自動化ツール等による連続採点を含む）</li>
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
                        <li>AI採点機能の結果の正確性（AIによる採点には誤りが含まれる可能性があり、最終的な判断は保護者が行うものとします）</li>
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

                    <h3>7. 利用制限</h3>
                    <p>
                        運営者は、以下の場合において、事前の通知なく本アプリの利用を制限または停止することができます：
                    </p>
                    <ul>
                        <li>AI採点機能の過度な利用が検出された場合</li>
                        <li>本規約に違反する行為が確認された場合</li>
                        <li>システムの安定性や他のユーザーへの影響が懸念される場合</li>
                        <li>サーバーやAPI利用コストが想定を大幅に超過した場合</li>
                    </ul>

                    <h3>8. 規約の変更</h3>
                    <p>
                        運営者は、必要に応じて本規約を変更することがあります。
                        変更後の規約は、本アプリ内に掲示した時点から効力を生じます。
                    </p>

                    <h3>9. 準拠法</h3>
                    <p>
                        本規約は、日本法に準拠し、解釈されるものとします。
                    </p>

                    <h3>10. お問い合わせ</h3>
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
