import React from 'react';

// 推奨教材サイト一覧
const RECOMMENDED_SITES = [
    {
        name: 'ふたば問題集',
        description: '文部科学省の新学習指導要領に対応。小学校で習う算数の全分野をカバーした無料プリント集です。',
        url: 'https://futaba-workbook.com/',
        highlight: '🏆 全単元カバー',
        subjects: ['算数'],
        grades: ['小1〜小6'],
    },
    {
        name: 'すたぺんドリル',
        description: 'プロの塾講師が作成。足し算から図形・思考力問題まで幅広くカバー。質の高い教材が揃っています。',
        url: 'https://startoo.co/workbook/sansu/',
        highlight: '👨‍🏫 塾講師監修',
        subjects: ['算数', '国語', '理科', '社会', '英語'],
        grades: ['幼児', '小1〜小6'],
    },
    {
        name: 'すきるまドリル',
        description: '市販ドリルに近い構成。単元の導入→練習→まとめの流れが作りやすく、家庭学習に最適です。',
        url: 'https://sukiruma.net/',
        highlight: '📚 市販ドリル風の構成',
        subjects: ['算数', '国語', '英語'],
        grades: ['小1〜小6', '中1〜中3'],
    },
    {
        name: 'ちびむすドリル',
        description: '非常に細かく単元が分かれており、苦手なところだけを重点的に練習したい時に最適です。',
        url: 'https://happylilac.net/syogaku.html',
        highlight: '🎯 苦手克服に最適',
        subjects: ['算数', '国語', '理科', '社会', '英語'],
        grades: ['幼児', '小1〜小6', '中1〜中3'],
    },
    {
        name: '算願（さんがん）',
        description: '計算ドリル、筆算、文章題、図形など、算数に特化した豊富なプリント集。',
        url: 'https://www.sangan.jp/',
        highlight: '🔢 算数特化',
        subjects: ['算数・数学'],
        grades: ['小1〜中3'],
    },
    {
        name: '計算プリント.com',
        description: '計算問題に特化したシンプルなドリル。繰り返し練習に最適です。',
        url: 'https://keipri.com/',
        highlight: '✏️ 計算練習特化',
        subjects: ['算数（計算）'],
        grades: ['小1〜小6'],
    },
];

interface DrillCatalogProps {
    onImportConfig?: (addPDF: (file: Blob, fileName: string) => Promise<boolean>) => void;
    addPDF: (file: Blob, fileName: string) => Promise<boolean>;
}

export default function DrillCatalog({ }: DrillCatalogProps) {
    const handleOpenSite = (url: string) => {
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="drill-catalog" style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
            <h2 style={{
                textAlign: 'center',
                marginBottom: '10px',
                color: '#2c3e50'
            }}>
                📚 おすすめ無料教材サイト
            </h2>

            <p style={{
                textAlign: 'center',
                color: '#666',
                marginBottom: '25px',
                fontSize: '14px',
                lineHeight: '1.6'
            }}>
                以下のサイトからPDFをダウンロードして、<br />
                ホーム画面の「<strong>+ Add PDF</strong>」ボタンで登録してください。
            </p>

            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}>
                {RECOMMENDED_SITES.map((site) => (
                    <div
                        key={site.name}
                        style={{
                            border: '1px solid #e0e0e0',
                            borderRadius: '12px',
                            padding: '20px',
                            backgroundColor: '#fff',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                            transition: 'transform 0.2s, box-shadow 0.2s',
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = 'translateY(-2px)';
                            e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.1)';
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.06)';
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                                    <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '18px' }}>
                                        {site.name}
                                    </h3>
                                    <span style={{
                                        backgroundColor: '#e8f5e9',
                                        color: '#2e7d32',
                                        padding: '3px 10px',
                                        borderRadius: '12px',
                                        fontSize: '12px',
                                        fontWeight: 'bold',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {site.highlight}
                                    </span>
                                </div>

                                <p style={{
                                    margin: '0 0 12px 0',
                                    color: '#555',
                                    fontSize: '14px',
                                    lineHeight: '1.5'
                                }}>
                                    {site.description}
                                </p>

                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{
                                        fontSize: '12px',
                                        color: '#888',
                                        backgroundColor: '#f5f5f5',
                                        padding: '2px 8px',
                                        borderRadius: '4px'
                                    }}>
                                        📖 {site.subjects.join(' / ')}
                                    </span>
                                    <span style={{
                                        fontSize: '12px',
                                        color: '#888',
                                        backgroundColor: '#f5f5f5',
                                        padding: '2px 8px',
                                        borderRadius: '4px'
                                    }}>
                                        🎒 {site.grades.join(' / ')}
                                    </span>
                                </div>
                            </div>

                            <button
                                onClick={() => handleOpenSite(site.url)}
                                style={{
                                    padding: '12px 24px',
                                    backgroundColor: '#3498db',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontSize: '14px',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    transition: 'background-color 0.2s',
                                    whiteSpace: 'nowrap'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = '#2980b9';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = '#3498db';
                                }}
                            >
                                サイトを開く
                                <span style={{ fontSize: '16px' }}>→</span>
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            <div style={{
                marginTop: '30px',
                padding: '16px',
                backgroundColor: '#fff3e0',
                borderRadius: '8px',
                border: '1px solid #ffe0b2'
            }}>
                <p style={{
                    margin: 0,
                    fontSize: '13px',
                    color: '#e65100',
                    lineHeight: '1.6'
                }}>
                    💡 <strong>使い方のヒント：</strong><br />
                    「ふたば問題集」は新学習指導要領に対応した全単元カバーのプリントが揃っています。<br />
                    PDFをダウンロードしたら、コンビニで両面印刷すれば市販ドリルのように使えます！
                </p>
            </div>

            <div style={{
                marginTop: '16px',
                padding: '12px',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                textAlign: 'center'
            }}>
                <p style={{
                    margin: 0,
                    fontSize: '11px',
                    color: '#888',
                    lineHeight: '1.5'
                }}>
                    ※ 各サイトの教材は、それぞれのサイトの利用規約に従ってご利用ください。<br />
                    HomeTeacherは教材の配布元ではなく、リンクを紹介しているのみです。
                </p>
            </div>
        </div>
    );
}
