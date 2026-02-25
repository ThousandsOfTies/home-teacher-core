import React, { useState, useRef, useEffect, useCallback } from 'react';
import { jsPDF } from 'jspdf';
import { processImageFiles } from '../../utils/imageProcessor';
import Cropper from 'react-cropper';
import 'cropperjs/dist/cropper.css';

interface ImageEditorProps {
    file: File | Blob;
    onSave: (processedBlob: Blob) => void;
    onCancel: () => void;
}

export const ImageEditor: React.FC<ImageEditorProps> = ({ file, onSave, onCancel }) => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [mode, setMode] = useState<'crop' | 'adjust'>('crop');
    const cropperRef = useRef<HTMLImageElement>(null);

    // Adjustments
    const [contrast, setContrast] = useState(1);
    const [brightness, setBrightness] = useState(1);
    const [grayscale, setGrayscale] = useState(false);

    useEffect(() => {
        const url = URL.createObjectURL(file);
        setImageSrc(url);
        return () => URL.revokeObjectURL(url);
    }, [file]);

    const handleSave = async () => {
        // Apply crop first
        const cropper = (cropperRef.current as any)?.cropper;
        let canvasToProcess = cropper ? cropper.getCroppedCanvas({ fillColor: '#ffffff' }) : null;

        if (!canvasToProcess && typeof document !== 'undefined') {
            const img = new Image();
            img.src = imageSrc || '';
            await new Promise(resolve => { img.onload = resolve });
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx?.drawImage(img, 0, 0);
            canvasToProcess = canvas;
        }

        if (!canvasToProcess) return;

        // Apply filters
        const ctx = canvasToProcess.getContext('2d');
        if (ctx) {
            const imageData = ctx.getImageData(0, 0, canvasToProcess.width, canvasToProcess.height);
            const data = imageData.data;

            for (let i = 0; i < data.length; i += 4) {
                // RGB
                let r = data[i];
                let g = data[i + 1];
                let b = data[i + 2];

                // Apply brightness
                r = Math.min(255, r * brightness);
                g = Math.min(255, g * brightness);
                b = Math.min(255, b * brightness);

                // Apply contrast
                r = ((r / 255 - 0.5) * contrast + 0.5) * 255;
                g = ((g / 255 - 0.5) * contrast + 0.5) * 255;
                b = ((b / 255 - 0.5) * contrast + 0.5) * 255;

                r = Math.max(0, Math.min(255, r));
                g = Math.max(0, Math.min(255, g));
                b = Math.max(0, Math.min(255, b));

                if (grayscale) {
                    const avg = (r + g + b) / 3;
                    data[i] = avg;
                    data[i + 1] = avg;
                    data[i + 2] = avg;
                } else {
                    data[i] = r;
                    data[i + 1] = g;
                    data[i + 2] = b;
                }
            }
            ctx.putImageData(imageData, 0, 0);
        }

        canvasToProcess.toBlob((blob) => {
            if (blob) {
                onSave(blob);
            }
        }, 'image/jpeg', 0.9);
    };

    if (!imageSrc) return <div>Loading...</div>;

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
            zIndex: 10000,
            display: 'flex',
            flexDirection: 'column',
            color: 'white'
        }}>
            {/* Header */}
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333' }}>
                <h2 style={{ margin: 0 }}>画像補正</h2>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={onCancel} style={{ padding: '8px 16px', borderRadius: '4px', background: '#555', color: 'white', border: 'none', cursor: 'pointer' }}>
                        キャンセル
                    </button>
                    <button onClick={handleSave} style={{ padding: '8px 16px', borderRadius: '4px', background: '#3498db', color: 'white', border: 'none', cursor: 'pointer' }}>
                        適用する
                    </button>
                </div>
            </div>

            {/* Main Editor Area */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

                {/* Image View */}
                <div style={{ flex: 1, padding: '20px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {/* 透過した方眼紙オーバーレイ */}
                    <div style={{
                        position: 'absolute',
                        top: 20, left: 20, right: 20, bottom: 20,
                        pointerEvents: 'none',
                        backgroundImage: `
                             linear-gradient(rgba(255, 255, 255, 0.2) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(255, 255, 255, 0.2) 1px, transparent 1px)
                         `,
                        backgroundSize: '100px 100px',
                        zIndex: 10
                    }} />

                    {mode === 'crop' ? (
                        <Cropper
                            src={imageSrc}
                            style={{ height: '100%', width: '100%' }}
                            // Cropper.js options
                            initialAspectRatio={null as any}
                            guides={true}
                            ref={cropperRef}
                            background={false}
                            responsive={true}
                            restore={false}
                            viewMode={1}
                        />
                    ) : (
                        <div style={{
                            width: '100%',
                            height: '100%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <img
                                src={imageSrc}
                                style={{
                                    maxWidth: '100%',
                                    maxHeight: '100%',
                                    objectFit: 'contain',
                                    filter: `
                                        brightness(${brightness}) 
                                        contrast(${contrast}) 
                                        ${grayscale ? 'grayscale(100%)' : ''}
                                    `
                                }}
                            />
                        </div>
                    )}
                </div>

                {/* Sidebar Controls */}
                <div style={{ width: '300px', background: '#1a1a1a', borderLeft: '1px solid #333', padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                    {/* Tabs */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={() => setMode('crop')}
                            style={{ flex: 1, padding: '8px', cursor: 'pointer', background: mode === 'crop' ? '#3498db' : '#333', color: 'white', border: 'none', borderRadius: '4px' }}
                        >
                            切り抜き・回転
                        </button>
                        <button
                            onClick={() => setMode('adjust')}
                            style={{ flex: 1, padding: '8px', cursor: 'pointer', background: mode === 'adjust' ? '#3498db' : '#333', color: 'white', border: 'none', borderRadius: '4px' }}
                        >
                            画質調整
                        </button>
                    </div>

                    {mode === 'crop' && (
                        <div>
                            <h4 style={{ margin: '0 0 12px 0' }}>回転</h4>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <button onClick={() => { (cropperRef.current as any)?.cropper?.rotate(-90) }} style={{ flex: 1, padding: '8px', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                    ↺ 90° 左
                                </button>
                                <button onClick={() => { (cropperRef.current as any)?.cropper?.rotate(90) }} style={{ flex: 1, padding: '8px', background: '#333', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                                    90° 右 ↻
                                </button>
                            </div>
                            <p style={{ fontSize: '12px', color: '#888', marginTop: '16px' }}>
                                画像の四隅をドラッグして、不要な余白を切り取ることができます。
                            </p>
                        </div>
                    )}

                    {mode === 'adjust' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                            {/* Presets */}
                            <div>
                                <h4 style={{ margin: '0 0 12px 0' }}>プリセット（白抜き化）</h4>
                                <button
                                    onClick={() => { setContrast(1.8); setBrightness(1.2); setGrayscale(true); }}
                                    style={{ width: '100%', padding: '12px', background: '#2c3e50', color: 'white', border: '1px solid #34495e', borderRadius: '4px', cursor: 'pointer' }}
                                >
                                    ✨ ドリルくっきりモード
                                </button>
                            </div>

                            <hr style={{ borderColor: '#333', margin: '8px 0' }} />

                            {/* Manual Sliders */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '14px' }}>コントラスト</label>
                                    <span style={{ fontSize: '14px', color: '#aaa' }}>{contrast.toFixed(1)}</span>
                                </div>
                                <input
                                    type="range" min="0.5" max="3" step="0.1"
                                    value={contrast}
                                    onChange={(e) => setContrast(parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                    <label style={{ fontSize: '14px' }}>明るさ</label>
                                    <span style={{ fontSize: '14px', color: '#aaa' }}>{brightness.toFixed(1)}</span>
                                </div>
                                <input
                                    type="range" min="0.5" max="2" step="0.1"
                                    value={brightness}
                                    onChange={(e) => setBrightness(parseFloat(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                                <input
                                    type="checkbox"
                                    id="grayscale"
                                    checked={grayscale}
                                    onChange={(e) => setGrayscale(e.target.checked)}
                                    style={{ width: '18px', height: '18px' }}
                                />
                                <label htmlFor="grayscale" style={{ cursor: 'pointer' }}>白黒（グレースケール）にする</label>
                            </div>

                            <button
                                onClick={() => { setContrast(1); setBrightness(1); setGrayscale(false); }}
                                style={{ marginTop: '16px', padding: '8px', background: 'transparent', color: '#aaa', border: '1px solid #555', borderRadius: '4px', cursor: 'pointer' }}
                            >
                                リセット
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
