import React from 'react';
import { SubjectInfo } from '../../services/api';
import { MdCleaningServices, MdContrast, MdLightbulbOutline } from 'react-icons/md';

interface EditorToolbarProps {
    onBack?: () => void;

    // Subject Dropdown
    subjectId: string | undefined;
    subjectsList: SubjectInfo[];
    subjectLoading: boolean;
    onSubjectChange: (subjectId: string) => void;

    // Adjustments
    contrast: number;
    setContrast: (val: number) => void;
    brightness: number;
    setBrightness: (val: number) => void;
    removeShadow: boolean;
    setRemoveShadow: (val: boolean) => void;

    // Rotation
    onRotate: (angle: number) => void;
    rotationAngle: number;

    // Perspective
    hasDistortion?: boolean;

    // Reset
    onReset: () => void;

    // Action
    disabled?: boolean;
}

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
    onBack,
    subjectId,
    subjectsList,
    subjectLoading,
    onSubjectChange,
    contrast,
    setContrast,
    brightness,
    setBrightness,
    removeShadow,
    setRemoveShadow,
    onRotate,
    rotationAngle,
    hasDistortion,
    onReset,
    disabled
}) => {

    return (
        <div className="toolbar editor-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', backgroundColor: '#f5f6fa', borderBottom: '1px solid #dcdde1', flexWrap: 'nowrap', overflowX: 'auto' }}>

            {/* Left Area: Back & Pagination */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexShrink: 0 }}>
                {onBack && (
                    <button onClick={onBack} title="ホームに戻る" style={{ border: 'none', background: 'none', fontSize: '20px', cursor: 'pointer', flexShrink: 0 }}>
                        🔙
                    </button>
                )}
            </div>

            {/* Middle Area: Tools */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginLeft: 'auto', marginRight: '16px' }}>
                {/* Subject Dropdown */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <select
                        value={subjectId || ''}
                        onChange={(e) => onSubjectChange(e.target.value)}
                        disabled={subjectLoading || disabled}
                        style={{ padding: '6px 10px', borderRadius: '4px', border: '1px solid #bdc3c7', backgroundColor: 'white', maxWidth: '140px' }}
                    >
                        <option value="">自動（未設定）</option>
                        {subjectsList.map((subject) => (
                            <option key={subject.id} value={subject.id}>
                                {subject.icon} {subject.labels?.ja || subject.id}
                            </option>
                        ))}
                    </select>
                </div>

                <div style={{ width: '1px', height: '24px', backgroundColor: '#dcdde1' }} />

                {/* Filters */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: '#636e72' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: '18px' }} title="コントラスト" onClick={() => setContrast(1)}>
                            <MdContrast style={{ transform: 'scaleX(-1)' }} />
                        </span>
                        <input type="range" min="0.5" max="3" step="0.1" value={contrast} onChange={e => setContrast(parseFloat(e.target.value))} style={{ width: '240px' }} disabled={disabled} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <span style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', fontSize: '18px' }} title="明るさ" onClick={() => setBrightness(1)}>
                            <MdLightbulbOutline />
                        </span>
                        <input type="range" min="0.5" max="2" step="0.1" value={brightness} onChange={e => setBrightness(parseFloat(e.target.value))} style={{ width: '240px' }} disabled={disabled} />
                    </div>
                    <button
                        onClick={() => setRemoveShadow(!removeShadow)}
                        disabled={disabled}
                        title="背景の影を自動で消去します"
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '32px', height: '32px', border: 'none', borderRadius: '4px',
                            backgroundColor: removeShadow ? '#e67e22' : 'transparent',
                            color: removeShadow ? 'white' : '#636e72',
                            cursor: disabled ? 'not-allowed' : 'pointer',
                            fontSize: '18px',
                            transition: 'background-color 0.2s, color 0.2s',
                            opacity: disabled ? 0.5 : 1
                        }}
                    >
                        <MdCleaningServices />
                    </button>
                </div>

                <div style={{ width: '1px', height: '24px', backgroundColor: '#dcdde1' }} />

                {/* fine-Rotation */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid #bdc3c7', borderRadius: '4px', overflow: 'hidden' }}>
                        <button onClick={() => onRotate(-0.1)} disabled={disabled} style={{ padding: '4px 8px', border: 'none', background: 'none', cursor: disabled ? 'not-allowed' : 'pointer', borderRight: '1px solid #bdc3c7' }} title="左に0.1度回転">
                            ◀
                        </button>
                        <span style={{ padding: '0 8px', fontSize: '13px', minWidth: '40px', textAlign: 'center' }}>
                            {rotationAngle > 0 ? '+' : ''}{rotationAngle.toFixed(1)}°
                        </span>
                        <button onClick={() => onRotate(0.1)} disabled={disabled} style={{ padding: '4px 8px', border: 'none', background: 'none', cursor: disabled ? 'not-allowed' : 'pointer', borderLeft: '1px solid #bdc3c7' }} title="右に0.1度回転">
                            ▶
                        </button>
                    </div>
                </div>

                <div style={{ width: '1px', height: '24px', backgroundColor: '#dcdde1' }} />

                {/* Reset Button */}
                <button
                    onClick={onReset}
                    disabled={disabled || (contrast === 1 && brightness === 1 && rotationAngle === 0 && !removeShadow && !hasDistortion)}
                    title="このページの編集（明るさ、回転など）を初期状態に戻します"
                    style={{
                        padding: '6px 12px',
                        backgroundColor: (contrast === 1 && brightness === 1 && rotationAngle === 0 && !removeShadow && !hasDistortion) ? '#bdc3c7' : '#e74c3c',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: disabled || (contrast === 1 && brightness === 1 && rotationAngle === 0 && !removeShadow) ? 'not-allowed' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="1" y="1" width="18" height="22" rx="2" fill="white" stroke="#999" strokeWidth="0.8" />
                        <g transform="translate(3, 5) scale(0.6)" stroke="#e74c3c" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                        </g>
                    </svg>
                </button>
            </div>
        </div>
    );
};
