import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ICON_SVG } from '../../constants/icons';

export type TextDirection = 'horizontal' | 'vertical-rl' | 'vertical-lr';

interface StudyToolbarProps {
    onBack?: () => void;
    isSplitView: boolean;
    toggleSplitView: () => void;
    activeTab: 'A' | 'B';
    toggleActiveTab: () => void;

    // Grading
    isSelectionMode: boolean;
    isGrading: boolean;
    startGrading: () => void;
    cancelSelection: () => void;

    // Text Tool
    isTextMode: boolean;
    toggleTextMode: () => void;
    textFontSize: number;
    setTextFontSize: (size: number) => void;
    textDirection: TextDirection;
    setTextDirection: (dir: TextDirection) => void;

    // Pen Tool
    isDrawingMode: boolean;
    toggleDrawingMode: () => void;
    penColor: string;
    setPenColor: (color: string) => void;
    penSize: number;
    setPenSize: (size: number) => void;

    // Eraser Tool
    isEraserMode: boolean;
    toggleEraserMode: () => void;
    eraserSize: number;
    setEraserSize: (size: number) => void;

    // Actions
    onUndo: () => void;
    onClear: () => void;
    onClearAll: () => void;
}

export const StudyToolbar: React.FC<StudyToolbarProps> = ({
    onBack,
    isSplitView,
    toggleSplitView,
    activeTab,
    toggleActiveTab,
    isSelectionMode,
    isGrading,
    startGrading,
    cancelSelection,
    isTextMode,
    toggleTextMode,
    textFontSize,
    setTextFontSize,
    textDirection,
    setTextDirection,
    isDrawingMode,
    toggleDrawingMode,
    penColor,
    setPenColor,
    penSize,
    setPenSize,
    isEraserMode,
    toggleEraserMode,
    eraserSize,
    setEraserSize,
    onUndo,
    onClear,
    onClearAll
}) => {
    const { t } = useTranslation();

    // Popups visibility state
    const [showTextPopup, setShowTextPopup] = useState(false);
    const [showPenPopup, setShowPenPopup] = useState(false);
    const [showEraserPopup, setShowEraserPopup] = useState(false);

    // Wrappers to toggle popups and modes
    const handleTextClick = () => {
        if (isTextMode) {
            setShowTextPopup(!showTextPopup);
        } else {
            toggleTextMode();
            setShowTextPopup(false);
            setShowPenPopup(false);
            setShowEraserPopup(false);
        }
    };

    const handlePenClick = () => {
        if (isDrawingMode) {
            setShowPenPopup(!showPenPopup);
        } else {
            toggleDrawingMode();
            setShowPenPopup(false);
            setShowEraserPopup(false);
            setShowTextPopup(false);
        }
    };

    const handleEraserClick = () => {
        if (isEraserMode) {
            setShowEraserPopup(!showEraserPopup);
        } else {
            toggleEraserMode();
            setShowEraserPopup(false);
            setShowPenPopup(false);
            setShowTextPopup(false);
        }
    };

    return (
        <div className="toolbar">
            {/* 戻るボタン */}
            {onBack && (
                <>
                    <button onClick={onBack} title="ホームに戻る">
                        🏠
                    </button>

                    <div className="divider"></div>

                    {/* Split View Toggle */}
                    <button
                        onClick={toggleSplitView}
                        title={isSplitView ? 'シングルビューに戻す' : '2画面表示 (Split View)'}
                        className={isSplitView ? 'active' : ''}
                    >
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="2" y="4" width="9" height="16" rx="1" stroke="currentColor" strokeWidth="1" fill={isSplitView ? "white" : "none"} />
                            <rect x="13" y="4" width="9" height="16" rx="1" stroke="currentColor" strokeWidth="1" fill={isSplitView ? "white" : "none"} />
                        </svg>
                    </button>

                    {/* Tab Switcher Button */}
                    <button
                        className={`tab-switcher-btn ${!isSplitView ? 'active' : ''}`}
                        onClick={toggleActiveTab}
                        title={isSplitView ? "シングルビューへ切替" : "A/B 切替"}
                        style={{
                            padding: '12px 8px',
                            minWidth: 'auto',
                            display: 'flex',
                            alignItems: 'center',
                        }}
                    >
                        {/* A Indicator */}
                        <span
                            style={{
                                fontWeight: activeTab === 'A' ? 'bold' : 'normal',
                                textDecoration: activeTab === 'A' ? 'underline' : 'none',
                                color: activeTab === 'A' ? '#4CAF50' : 'inherit',
                                fontSize: '0.85rem'
                            }}
                        >
                            A
                        </span>

                        <span style={{ margin: '0 2px', color: '#ccc', fontSize: '0.85rem' }}>/</span>

                        {/* B Indicator */}
                        <span
                            style={{
                                fontWeight: activeTab === 'B' ? 'bold' : 'normal',
                                textDecoration: activeTab === 'B' ? 'underline' : 'none',
                                color: activeTab === 'B' ? '#4CAF50' : 'inherit',
                                fontSize: '0.85rem'
                            }}
                        >
                            B
                        </span>
                    </button>

                    <div className="divider"></div>
                </>
            )}

            {/* 右寄せコンテナ */}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
                <>
                    <div className="divider"></div>

                    {/* 採点ボタン */}
                    <button
                        onClick={isSelectionMode ? cancelSelection : startGrading}
                        className={isSelectionMode ? 'active' : ''}
                        disabled={isGrading}
                        title={isSelectionMode ? t('gradingConfirmation.cancel') : t('gradingConfirmation.gradeBySelection')}
                    >
                        {isGrading ? '⏳' : '✅'}
                    </button>

                    {/* テキスト入力ツール */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={handleTextClick}
                            className={isTextMode ? 'active' : ''}
                            title={isTextMode ? 'テキストモード ON（クリックで設定）' : 'テキストモード OFF'}
                            style={{ fontFamily: 'Times New Roman, serif', fontSize: '1.4rem' }}
                        >
                            T
                        </button>

                        {/* テキスト設定ポップアップ */}
                        {isTextMode && showTextPopup && (
                            <div className="tool-popup" style={{ minWidth: '180px' }}>
                                <div className="popup-row">
                                    <label>サイズ:</label>
                                    <input
                                        type="range"
                                        min="10"
                                        max="32"
                                        value={textFontSize}
                                        onChange={(e) => setTextFontSize(Number(e.target.value))}
                                        style={{ width: '80px' }}
                                    />
                                    <span>{textFontSize}px</span>
                                </div>
                                <div className="popup-row">
                                    <label>方向:</label>
                                    <select
                                        value={textDirection}
                                        onChange={(e) => setTextDirection(e.target.value as TextDirection)}
                                        style={{ padding: '4px', borderRadius: '4px' }}
                                    >
                                        <option value="horizontal">横書き (Z型)</option>
                                        <option value="vertical-rl">縦書き右始 (N型)</option>
                                        <option value="vertical-lr">縦書き左始</option>
                                    </select>
                                </div>
                                <div className="popup-row">
                                    <label>色:</label>
                                    <input
                                        type="color"
                                        value={penColor}
                                        onChange={(e) => setPenColor(e.target.value)}
                                        style={{ width: '40px', height: '30px', border: '1px solid #ccc', cursor: 'pointer' }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 描画ツール */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={handlePenClick}
                            className={isDrawingMode ? 'active' : ''}
                            title={isDrawingMode ? 'ペンモード ON（クリックで設定）' : 'ペンモード OFF'}
                        >
                            {ICON_SVG.pen(isDrawingMode, penColor)}
                        </button>

                        {/* ペン設定ポップアップ */}
                        {isDrawingMode && showPenPopup && (
                            <div className="tool-popup">
                                <div className="popup-row">
                                    <label>色:</label>
                                    <input
                                        type="color"
                                        value={penColor}
                                        onChange={(e) => setPenColor(e.target.value)}
                                        style={{ width: '40px', height: '30px', border: '1px solid #ccc', cursor: 'pointer' }}
                                    />
                                </div>
                                <div className="popup-row">
                                    <label>太さ:</label>
                                    <input
                                        type="range"
                                        min="1"
                                        max="10"
                                        value={penSize}
                                        onChange={(e) => setPenSize(Number(e.target.value))}
                                        style={{ width: '100px' }}
                                    />
                                    <span>{penSize}px</span>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* 消しゴムツール */}
                    <div style={{ position: 'relative' }}>
                        <button
                            onClick={handleEraserClick}
                            className={isEraserMode ? 'active' : ''}
                            title={isEraserMode ? '消しゴムモード ON（クリックで設定）' : '消しゴムモード OFF'}
                        >
                            {ICON_SVG.eraser(isEraserMode)}
                        </button>

                        {/* 消しゴム設定ポップアップ */}
                        {isEraserMode && showEraserPopup && (
                            <div className="tool-popup">
                                <div className="popup-row">
                                    <label>サイズ:</label>
                                    <input
                                        type="range"
                                        min="10"
                                        max="100"
                                        value={eraserSize}
                                        onChange={(e) => setEraserSize(Number(e.target.value))}
                                        style={{ width: '100px' }}
                                    />
                                    <span>{eraserSize}px</span>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="divider"></div>

                    <button
                        onClick={onUndo}
                        title="元に戻す (Ctrl+Z)"
                    >
                        ↩️
                    </button>
                    <button
                        onClick={onClear}
                        onDoubleClick={onClearAll}
                        title="クリア（ダブルクリックで全ページクリア）"
                    >
                        <svg width="20" height="24" viewBox="0 0 20 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <rect x="1" y="1" width="18" height="22" rx="2" fill="white" stroke="#999" strokeWidth="0.8" />
                            <path d="M16 3 L12 7 L16 11 L20 7 Z" fill="yellow" stroke="orange" strokeWidth="0.8" transform="translate(-2, -1)" />
                        </svg>
                    </button>

                </>
            </div>
        </div>
    );
};
