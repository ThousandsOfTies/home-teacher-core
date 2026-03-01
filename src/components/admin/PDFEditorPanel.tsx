import React, { useState, useRef, useEffect } from 'react';
import { PDFFileRecord, updatePDFRecord } from '../../utils/indexedDB';
import { EditorToolbar } from './EditorToolbar';
import { usePDFRenderer } from '../../hooks/pdf/usePDFRenderer';
import { getSubjects, SubjectInfo } from '../../services/api';
import { PDFDocument } from 'pdf-lib';
import '../study/StudyPanel.css'; // Reuse study panel styles for layout
import { PerspectiveCropper, DEFAULT_CORNERS } from './PerspectiveCropper';
import { warpPerspectiveCanvas } from '../../utils/warpPerspective';

interface PDFEditorPanelProps {
    pdfRecord: PDFFileRecord;
    pdfId: string;
    onBack: () => void;
}

export default function PDFEditorPanel({ pdfRecord, pdfId, onBack }: PDFEditorPanelProps) {
    const [currentPage, setCurrentPage] = useState(1);
    const [sliderValue, setSliderValue] = useState<number | null>(null);
    const [subjectId, setSubjectId] = useState<string | undefined>(pdfRecord.subjectId);

    type PageEdit = { contrast: number; brightness: number; removeShadow: boolean; rotationAngle: number; distortionCorners?: [number, number, number, number, number, number, number, number] };
    const [pageEdits, setPageEdits] = useState<Record<number, PageEdit>>({});

    const currentEdit = pageEdits[currentPage] || { contrast: 1, brightness: 1, removeShadow: false, rotationAngle: 0 };
    const contrast = currentEdit.contrast;
    const brightness = currentEdit.brightness;
    const removeShadow = currentEdit.removeShadow;
    const rotationAngle = currentEdit.rotationAngle;

    const updateCurrentPageEdit = (updates: Partial<PageEdit>) => {
        setPageEdits(prev => ({
            ...prev,
            [currentPage]: { ...(prev[currentPage] || { contrast: 1, brightness: 1, removeShadow: false, rotationAngle: 0 }), ...updates }
        }));
    };

    // Subjects State
    const [subjectsList, setSubjectsList] = useState<SubjectInfo[]>([]);
    const [subjectLoading, setSubjectLoading] = useState(true);

    // Initial Fetch
    useEffect(() => {
        const fetchSubjects = async () => {
            try {
                const res = await getSubjects();
                setSubjectsList(res.subjects);
            } catch (error) {
                console.error('Failed to load subjects:', error);
            } finally {
                setSubjectLoading(false);
            }
        };
        fetchSubjects();
    }, []);

    // Processing State
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [isExtracting, setIsExtracting] = useState(false);

    const [isSaving, setIsSaving] = useState(false);

    const [previewImageSrc, setPreviewImageSrc] = useState<string | null>(null);

    // No live warp preview - corners are shown inline; warp is applied on save/page change

    // Messages
    const [statusMessage, setStatusMessage] = useState<string | null>(null);
    const messageTimeout = useRef<NodeJS.Timeout>();

    const { pdfDoc, isLoading: pdfLoading, error: pdfError } = usePDFRenderer(pdfRecord);

    const addStatusMessage = (msg: string) => {
        setStatusMessage(msg);
        if (messageTimeout.current) clearTimeout(messageTimeout.current);
        messageTimeout.current = setTimeout(() => {
            setStatusMessage(null);
        }, 3000);
    };

    // Extract PDF page to Image Source
    useEffect(() => {
        if (!pdfDoc) return;

        const extractPage = async () => {
            setIsExtracting(true);

            try {
                const page = await pdfDoc.getPage(currentPage);
                // high resolution
                const viewport = page.getViewport({ scale: 2.0 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (ctx) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    await page.render({ canvasContext: ctx, viewport }).promise;
                    const dataUrl = canvas.toDataURL('image/jpeg', 1.0);
                    setImageSrc(dataUrl);
                }
            } catch (err) {
                console.error("Failed to extract page", err);
                addStatusMessage('❌ ページの読み込みに失敗しました');
            } finally {
                setIsExtracting(false);
            }
        };

        extractPage();
    }, [pdfDoc, currentPage]);

    // -- Subject ID Update --
    const handleSubjectChange = async (newSubjectId: string) => {
        setSubjectId(newSubjectId);
        try {
            await updatePDFRecord(pdfId, { subjectId: newSubjectId });
            addStatusMessage('✅ 教科を更新しました');
        } catch (error) {
            console.error(error);
            addStatusMessage('❌ 教科の更新に失敗しました');
        }
    };

    // Utility: Apply edits back to the document and exit
    const handleBack = async () => {
        const editedPages = Object.keys(pageEdits).map(Number).filter(pageNum => {
            const edit = pageEdits[pageNum];
            return edit.contrast !== 1 || edit.brightness !== 1 || edit.removeShadow !== false || edit.rotationAngle !== 0 || edit.distortionCorners !== undefined;
        });

        if (editedPages.length === 0) {
            onBack();
            return;
        }

        setIsSaving(true);
        addStatusMessage('⏳ 保存中...');

        try {
            const originalBytes = await pdfRecord.fileData.arrayBuffer();
            const document = await PDFDocument.load(originalBytes);
            let newThumbnail: string | undefined = undefined;

            for (const pageNum of editedPages) {
                const edit = pageEdits[pageNum];

                // Get original page image
                const baseScale = 2.0;
                const page = await pdfDoc.getPage(pageNum);

                // Prevent out-of-memory if the page is already extremely large
                // Limit maximum width/height to reasonable bounds
                const unscaledViewport = page.getViewport({ scale: 1.0 });
                let scale = baseScale;
                if (unscaledViewport.width * scale > 4000 || unscaledViewport.height * scale > 4000) {
                    scale = Math.min(4000 / unscaledViewport.width, 4000 / unscaledViewport.height);
                }

                const viewport = page.getViewport({ scale });
                const canvas = window.document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) continue;

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({ canvasContext: ctx, viewport }).promise;

                let baseCanvas = canvas;
                if (edit.distortionCorners) {
                    const c = edit.distortionCorners;
                    const srcCorners = [
                        c[0] * canvas.width, c[1] * canvas.height,
                        c[2] * canvas.width, c[3] * canvas.height,
                        c[4] * canvas.width, c[5] * canvas.height,
                        c[6] * canvas.width, c[7] * canvas.height
                    ];
                    const w1 = Math.hypot(srcCorners[2] - srcCorners[0], srcCorners[3] - srcCorners[1]);
                    const w2 = Math.hypot(srcCorners[4] - srcCorners[6], srcCorners[5] - srcCorners[7]);
                    const dstW = Math.max(w1, w2);

                    const h1 = Math.hypot(srcCorners[6] - srcCorners[0], srcCorners[7] - srcCorners[1]);
                    const h2 = Math.hypot(srcCorners[4] - srcCorners[2], srcCorners[5] - srcCorners[3]);
                    const dstH = Math.max(h1, h2);

                    baseCanvas = await warpPerspectiveCanvas(canvas, srcCorners, dstW, dstH);
                }

                // Now create an offscreen canvas to apply filters and rotation
                const rad = (edit.rotationAngle * Math.PI) / 180;
                const absCos = Math.abs(Math.cos(rad));
                const absSin = Math.abs(Math.sin(rad));
                const newWidth = Math.ceil(baseCanvas.width * absCos + baseCanvas.height * absSin);
                const newHeight = Math.ceil(baseCanvas.width * absSin + baseCanvas.height * absCos);

                const processCanvas = window.document.createElement('canvas');
                processCanvas.width = newWidth;
                processCanvas.height = newHeight;
                const pCtx = processCanvas.getContext('2d', { willReadFrequently: true });
                if (!pCtx) continue;

                // fill white just in case
                pCtx.fillStyle = '#ffffff';
                pCtx.fillRect(0, 0, newWidth, newHeight);

                pCtx.translate(newWidth / 2, newHeight / 2);
                pCtx.rotate((edit.rotationAngle * Math.PI) / 180);
                pCtx.drawImage(baseCanvas, -baseCanvas.width / 2, -baseCanvas.height / 2);
                pCtx.resetTransform();

                if (edit.removeShadow) {
                    const shadowMapCanvas = window.document.createElement('canvas');
                    shadowMapCanvas.width = newWidth;
                    shadowMapCanvas.height = newHeight;
                    const sCtx = shadowMapCanvas.getContext('2d');
                    if (sCtx) {
                        const blurRadius = Math.floor(Math.max(newWidth, newHeight) * 0.05);
                        sCtx.filter = `blur(${blurRadius}px) invert(100%)`;
                        sCtx.drawImage(processCanvas, 0, 0);

                        pCtx.globalCompositeOperation = 'color-dodge';
                        pCtx.drawImage(shadowMapCanvas, 0, 0);
                        pCtx.globalCompositeOperation = 'source-over';
                    }
                }

                const imageData = pCtx.getImageData(0, 0, newWidth, newHeight);
                const data = imageData.data;
                for (let i = 0; i < data.length; i += 4) {
                    let r = data[i], g = data[i + 1], b = data[i + 2];

                    r = Math.min(255, r * edit.brightness);
                    g = Math.min(255, g * edit.brightness);
                    b = Math.min(255, b * edit.brightness);

                    r = ((r / 255 - 0.5) * edit.contrast + 0.5) * 255;
                    g = ((g / 255 - 0.5) * edit.contrast + 0.5) * 255;
                    b = ((b / 255 - 0.5) * edit.contrast + 0.5) * 255;

                    r = Math.max(0, Math.min(255, r));
                    g = Math.max(0, Math.min(255, g));
                    b = Math.max(0, Math.min(255, b));

                    data[i] = r; data[i + 1] = g; data[i + 2] = b;
                }
                pCtx.putImageData(imageData, 0, 0);

                if (pageNum === 1) {
                    const thumbCanvas = window.document.createElement('canvas');
                    const maxDim = 800;
                    const scaleFactor = Math.min(1.0, maxDim / Math.max(newWidth, newHeight));
                    thumbCanvas.width = newWidth * scaleFactor;
                    thumbCanvas.height = newHeight * scaleFactor;
                    const tCtx = thumbCanvas.getContext('2d');
                    if (tCtx) {
                        tCtx.drawImage(processCanvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
                        newThumbnail = thumbCanvas.toDataURL('image/jpeg', 0.7);
                    }
                }

                const blob = await new Promise<Blob>((resolve, reject) => {
                    processCanvas.toBlob((b) => b ? resolve(b) : reject(), 'image/jpeg', 0.9);
                });

                const imageBytes = await blob.arrayBuffer();
                const pdfImage = await document.embedJpg(imageBytes);

                const docPageNum = pageNum - 1; // pdf-lib
                // Insert page with original PDF point sizes (divide by the pixel scale we used)
                const pdfPageWidth = newWidth / scale;
                const pdfPageHeight = newHeight / scale;

                const newPage = document.insertPage(docPageNum, [pdfPageWidth, pdfPageHeight]);
                document.removePage(docPageNum + 1);

                newPage.drawImage(pdfImage, {
                    x: 0,
                    y: 0,
                    width: pdfPageWidth,
                    height: pdfPageHeight
                });
            }

            const newPdfBytes = await document.save();
            const newBlob = new Blob([newPdfBytes as any], { type: 'application/pdf' });

            const updates: Partial<PDFFileRecord> = { fileData: newBlob };
            if (newThumbnail) {
                updates.thumbnail = newThumbnail;
            }
            await updatePDFRecord(pdfRecord.id, updates);

            addStatusMessage(`✅ 保存しました`);
            setTimeout(() => {
                onBack();
            }, 500);
        } catch (error) {
            console.error(error);
            addStatusMessage(`❌ 保存に失敗しました`);
            setIsSaving(false);
        }
    };

    const isLoadingPage = pdfLoading || isExtracting || !imageSrc;

    return (
        <div className="pdf-viewer-container" style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#2c3e50' }}>
            <EditorToolbar
                onBack={handleBack}
                subjectId={subjectId}
                subjectsList={subjectsList}
                subjectLoading={subjectLoading}
                onSubjectChange={handleSubjectChange}
                contrast={contrast}
                setContrast={(c) => updateCurrentPageEdit({ contrast: c })}
                brightness={brightness}
                setBrightness={(b) => updateCurrentPageEdit({ brightness: b })}
                removeShadow={removeShadow}
                setRemoveShadow={(r) => updateCurrentPageEdit({ removeShadow: r })}
                onRotate={(a) => updateCurrentPageEdit({ rotationAngle: rotationAngle + a })}
                rotationAngle={rotationAngle}
                hasDistortion={currentEdit.distortionCorners !== undefined}
                onReset={() => {
                    setPageEdits(prev => {
                        const newEdits = { ...prev };
                        delete newEdits[currentPage];
                        return newEdits;
                    });
                }}
                disabled={isSaving}
            />

            <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
                {statusMessage && (
                    <div className="status-message popup" style={{ position: 'absolute', top: 16, right: 16, zIndex: 1000, backgroundColor: 'rgba(0,0,0,0.8)', color: 'white', padding: '8px 16px', borderRadius: '4px' }}>
                        {statusMessage}
                    </div>
                )}

                {/* Loading Spinner */}
                {isLoadingPage && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                        backgroundColor: 'rgba(44, 62, 80, 0.9)', zIndex: 1000, color: 'white'
                    }}>
                        <div className="spinner" style={{
                            width: '40px',
                            height: '40px',
                            border: '4px solid rgba(255,255,255,0.2)',
                            borderTop: '4px solid #3498db',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite',
                            marginBottom: '16px'
                        }}></div>
                        <p style={{ fontWeight: 'bold' }}>ページの準備中...</p>
                        <style>{`
                            @keyframes spin {
                                0% { transform: rotate(0deg); }
                                100% { transform: rotate(360deg); }
                            }
                        `}</style>
                    </div>
                )}

                {/* PDF Error Display */}
                {pdfError && (
                    <div style={{
                        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                        backgroundColor: 'white', zIndex: 1000, padding: '20px', textAlign: 'center'
                    }}>
                        <p style={{ color: '#e74c3c', marginBottom: '16px', fontWeight: 'bold' }}>PDFの読み込みに失敗しました</p>
                        <p style={{ fontSize: '12px', color: '#666', maxWidth: '300px', wordBreak: 'break-all', marginBottom: '20px' }}>{pdfError}</p>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: '10px 20px', backgroundColor: '#3498db', color: 'white', border: 'none',
                                borderRadius: '4px', cursor: 'pointer', fontSize: '16px', boxShadow: '0 2px 5px rgba(0,0,0,0.2)'
                            }}
                        >
                            再読み込み
                        </button>
                    </div>
                )}

                {/* Image View */}
                {!isLoadingPage && imageSrc && (
                    <div style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        padding: '16px',
                        paddingRight: '64px'
                    }}>
                        {/* Grid overlay (reference for rotation & skew) */}
                        <div style={{
                            position: 'absolute',
                            top: '16px',
                            left: '16px',
                            right: '64px',
                            bottom: '16px',
                            pointerEvents: 'none',
                            backgroundImage: `
                                linear-gradient(rgba(255, 255, 255, 0.6) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(255, 255, 255, 0.6) 1px, transparent 1px),
                                linear-gradient(rgba(0, 0, 0, 0.4) 1px, transparent 1px),
                                linear-gradient(90deg, rgba(0, 0, 0, 0.4) 1px, transparent 1px)
                            `,
                            backgroundSize: '8.33% 5%, 8.33% 5%, 8.33% 5%, 8.33% 5%',
                            backgroundPosition: '0 0, 0 0, 1px 1px, 1px 1px',
                            zIndex: 5
                        }} />

                        {/* Image + inline corner handles */}
                        <div style={{
                            position: 'relative',
                            display: 'inline-block',
                            maxWidth: '100%',
                            maxHeight: '100%',
                            filter: `brightness(${brightness}) contrast(${contrast})`,
                            transition: 'filter 0.2s',
                            transform: `rotate(${rotationAngle}deg)`,
                        }}>
                            <img
                                src={imageSrc}
                                style={{
                                    display: 'block',
                                    maxWidth: '100%',
                                    maxHeight: 'calc(100vh - 80px)',
                                    objectFit: 'contain',
                                    userSelect: 'none',
                                    pointerEvents: 'none'
                                }}
                            />
                            {removeShadow && (
                                <img
                                    src={imageSrc}
                                    style={{
                                        position: 'absolute',
                                        inset: 0,
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'contain',
                                        userSelect: 'none',
                                        pointerEvents: 'none',
                                        mixBlendMode: 'color-dodge',
                                        filter: 'blur(3vmin) invert(100%)'
                                    }}
                                />
                            )}
                            {/* Inline perspective corner handles - always visible */}
                            <PerspectiveCropper
                                corners={currentEdit.distortionCorners ?? DEFAULT_CORNERS}
                                onChange={(corners) => updateCurrentPageEdit({ distortionCorners: corners })}
                                disabled={isSaving}
                            />
                        </div>
                    </div>
                )}

                {/* Page Navigation (Right Side) */}
                {pdfDoc && pdfDoc.numPages > 1 && (
                    <div className="page-scrollbar-container">
                        <button
                            className="page-nav-button"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 10))}
                            disabled={currentPage <= 1 || isSaving}
                            title="前の10ページ"
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '0.6' }}>
                                <span>▲</span><span>▲</span>
                            </div>
                        </button>
                        <button
                            className="page-nav-button"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage <= 1 || isSaving}
                            title="前のページ"
                        >
                            <span>▲</span>
                        </button>
                        <div className="page-slider-wrapper">
                            <input
                                type="range"
                                min="1"
                                max={pdfDoc.numPages}
                                value={sliderValue !== null ? sliderValue : currentPage}
                                onChange={(e) => setSliderValue(Number(e.target.value))}
                                onPointerUp={() => {
                                    if (sliderValue !== null && sliderValue !== currentPage) {
                                        setCurrentPage(sliderValue)
                                    }
                                    setSliderValue(null)
                                }}
                                onPointerCancel={() => setSliderValue(null)}
                                onTouchEnd={() => {
                                    if (sliderValue !== null && sliderValue !== currentPage) {
                                        setCurrentPage(sliderValue)
                                    }
                                    setSliderValue(null)
                                }}
                                className="page-slider"
                                title="ページ移動"
                                disabled={isSaving}
                            />
                        </div>
                        <button
                            className="page-nav-button"
                            onClick={() => setCurrentPage(p => Math.min(pdfDoc?.numPages || 1, p + 1))}
                            disabled={currentPage >= pdfDoc.numPages || isSaving}
                            title="次のページ"
                        >
                            <span>▼</span>
                        </button>
                        <button
                            className="page-nav-button"
                            onClick={() => setCurrentPage(p => Math.min(pdfDoc?.numPages || 1, p + 10))}
                            disabled={currentPage >= pdfDoc.numPages || isSaving}
                            title="次の10ページ"
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '0.6' }}>
                                <span>▼</span><span>▼</span>
                            </div>
                        </button>
                        <div className="page-indicator" style={{ marginBottom: "10px" }}>
                            {currentPage}/{pdfDoc.numPages}
                        </div>
                    </div>
                )}

                {/* Slider Dragging Overlay */}
                {sliderValue !== null && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        backgroundColor: 'rgba(0, 0, 0, 0.7)',
                        color: 'white',
                        fontSize: '64px',
                        fontWeight: 'bold',
                        padding: '32px 64px',
                        borderRadius: '16px',
                        zIndex: 10001,
                        pointerEvents: 'none'
                    }}>
                        {sliderValue}
                    </div>
                )}
            </div>
        </div>
    );
}
