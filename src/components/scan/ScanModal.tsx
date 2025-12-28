import { useState, useRef } from 'react';
import './ScanModal.css';

interface ScanModalProps {
    onClose: () => void;
}

interface Problem {
    problemNumber: string;
    type?: string;
    hasDiagram?: boolean;
    topic?: string;
}

interface Answer {
    problemNumber: string;
    correctAnswer: string;
}

interface PageAnalysisResult {
    pageType: 'problem' | 'answer' | 'unknown';
    pageNumber?: number;
    problems?: Problem[];
    answers?: Answer[];
    totalProblems?: number;
    totalAnswers?: number;
    rawResponse?: string;
}

export default function ScanModal({ onClose }: ScanModalProps) {
    const [image, setImage] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<PageAnalysisResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            setError('Please select an image file');
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            setImage(event.target?.result as string);
            setResult(null);
            setError(null);
        };
        reader.readAsDataURL(file);
    };

    const handleAnalyze = async () => {
        if (!image) return;

        setLoading(true);
        setError(null);

        try {
            // API call to local server
            const response = await fetch('http://localhost:3003/api/analyze-page', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    imageData: image,
                    // Sending a dummy page number as it's required by the API but not critical for initial scan
                    pageNumber: 0,
                    language: navigator.language
                }),
            });

            if (!response.ok) {
                throw new Error(`Server error: ${response.statusText}`);
            }

            const data = await response.json();

            if (data.success) {
                setResult({
                    pageType: data.pageType,
                    pageNumber: data.pageNumber,
                    ...data.data
                });
            } else {
                throw new Error(data.error || 'Analysis failed');
            }

        } catch (err) {
            console.error('Analysis error:', err);
            setError(err instanceof Error ? err.message : 'Failed to analyze page');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="scan-modal-overlay">
            <div className="scan-modal-content">
                <div className="scan-modal-header">
                    <h3>📄 Page Scanner</h3>
                    <button className="close-button" onClick={onClose}>×</button>
                </div>

                <div className="scan-modal-body">
                    {!image ? (
                        <div
                            className="upload-area"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="upload-icon">📷</div>
                            <p>Click to take photo or upload</p>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={handleFileSelect}
                                hidden
                            />
                        </div>
                    ) : (
                        <div className="preview-area">
                            <img src={image} alt="Preview" className="scan-preview" />
                            {!loading && !result && (
                                <div className="action-buttons">
                                    <button
                                        className="analyze-button"
                                        onClick={handleAnalyze}
                                    >
                                        🔍 Analyze Page
                                    </button>
                                    <button
                                        className="retry-button"
                                        onClick={() => {
                                            setImage(null);
                                            setResult(null);
                                        }}
                                    >
                                        Retake
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {loading && (
                        <div className="loading-state">
                            <div className="spinner"></div>
                            <p>Analyzing page structure...</p>
                        </div>
                    )}

                    {error && (
                        <div className="error-message">
                            {error}
                        </div>
                    )}

                    {result && (
                        <div className="result-area">
                            <div className={`result-header ${result.pageType}`}>
                                <span className="type-badge">
                                    {result.pageType === 'problem' ? '📝 Problem Page' :
                                        result.pageType === 'answer' ? '✅ Answer Key' : '❓ Unknown'}
                                </span>
                                {result.pageNumber && (
                                    <span className="page-badge">Page {result.pageNumber}</span>
                                )}
                            </div>

                            <div className="result-details">
                                {result.pageType === 'problem' && result.problems && (
                                    <div className="items-list">
                                        <h4>Found {result.problems.length} Problems</h4>
                                        <ul>
                                            {result.problems.map((p, i) => (
                                                <li key={i}>
                                                    <strong>{p.problemNumber}</strong>
                                                    {p.hasDiagram && <span className="diagram-icon">🖼️</span>}
                                                    <span className="type-info">{p.type}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {result.pageType === 'answer' && result.answers && (
                                    <div className="items-list">
                                        <h4>Found {result.answers.length} Answers</h4>
                                        <ul>
                                            {result.answers.map((a, i) => (
                                                <li key={i}>
                                                    <strong>{a.problemNumber}</strong>: {a.correctAnswer}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>

                            <button
                                className="retry-button secondary"
                                onClick={() => {
                                    setImage(null);
                                    setResult(null);
                                }}
                            >
                                Scan Another
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
