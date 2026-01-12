import React from 'react';
import { useTranslation } from 'react-i18next';

// 推奨教材サイト一覧
// 推奨教材サイト一覧 (JA)
const RECOMMENDED_SITES_JA = [
    {
        name: 'ふたば問題集',
        description: '文部科学省の新学習指導要領に対応。小学校で習う算数の全分野をカバーした無料プリント集です。',
        url: 'https://futaba-workbook.com/',
        highlight: '🏆 全単元カバー',
        subjects: ['算数'],
        grades: ['小1〜小6'],
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

// Recommended Sites (EN)
const RECOMMENDED_SITES_EN = [
    {
        name: 'K5 Learning',
        description: 'Free worksheets for kindergarten to grade 5. Organized by grade and topic.',
        url: 'https://www.k5learning.com/free-math-worksheets',
        highlight: '🏆 Comprehensive',
        subjects: ['Math', 'Reading', 'Science'],
        grades: ['K-5'],
    },
    {
        name: 'Math-Drills.com',
        description: 'One of the largest collections of free math worksheets. Over 50,000 pages.',
        url: 'https://www.math-drills.com/',
        highlight: '🔢 Huge Collection',
        subjects: ['Math'],
        grades: ['K-12'],
    },
    {
        name: 'Dad\'s Worksheets',
        description: 'Focused on math practice. Great for specific topics like fractions or geometry.',
        url: 'https://www.dadsworksheets.com/',
        highlight: '✏️ Math Focused',
        subjects: ['Math'],
        grades: ['K-6'],
    },
    {
        name: 'Math Worksheets 4 Kids',
        description: 'A wealth of worksheets for Math, English, Science, and Social Studies.',
        url: 'https://www.mathworksheets4kids.com/',
        highlight: '🎨 Colorful & Fun',
        subjects: ['Math', 'English', 'Science'],
        grades: ['K-8'],
    },
    {
        name: 'Education.com',
        description: 'High quality worksheets. Some require a free account to download.',
        url: 'https://www.education.com/worksheets/math/',
        highlight: '👨‍🏫 Teacher Created',
        subjects: ['Math', 'Reading', 'Writing'],
        grades: ['PreK-8'],
    }
];

interface DrillCatalogProps {
    onImportConfig?: (addPDF: (file: Blob, fileName: string) => Promise<boolean>) => void;
    addPDF: (file: Blob, fileName: string) => Promise<boolean>;
}

export default function DrillCatalog({ }: DrillCatalogProps) {
    const { t, i18n } = useTranslation();
    const sites = (i18n.language === 'en' || i18n.language?.startsWith('en')) ? RECOMMENDED_SITES_EN : RECOMMENDED_SITES_JA;

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
                {t('drillCatalog.title')}
            </h2>

            <p style={{
                textAlign: 'center',
                color: '#666',
                marginBottom: '25px',
                fontSize: '14px',
                lineHeight: '1.6'
            }} dangerouslySetInnerHTML={{ __html: t('drillCatalog.description') }} />

            <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
            }}>
                {sites.map((site) => (
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
                                    backgroundColor: 'white',
                                    color: '#3498db',
                                    border: '1px solid #3498db',
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
                                    e.currentTarget.style.backgroundColor = '#f0f8ff';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = 'white';
                                }}
                            >
                                {t('drillCatalog.openSite')}
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
                    <strong>{t('drillCatalog.tipsTitle')}</strong><br />
                    <span dangerouslySetInnerHTML={{ __html: t('drillCatalog.tipsContent') }} />
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
                }} dangerouslySetInnerHTML={{ __html: t('drillCatalog.disclaimer') }} />
            </div>
        </div>
    );
}
