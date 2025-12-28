import React, { useState } from 'react';
import { usePDFRecords } from '../../hooks/admin/usePDFRecords';

const OFFICIAL_DRILLS = [
    { title: 'けいさんドリル (1ねん たしざん Lv1)', file: 'math-g1-add-lv1.pdf', description: 'Basic addition up to 10' },
    { title: 'けいさんドリル (1ねん たしざん Lv2)', file: 'math-g1-add-lv2.pdf', description: 'Addition up to 20' },
    { title: 'ずけいドリル (3ねん めんせき)', file: 'math-g3-area-rect.pdf', description: 'Calculate area of rectangles' },
    { title: 'ぶんしょうだい (2ねん かけざん)', file: 'math-g2-word-multi.pdf', description: 'Multiplication word problems' },
];

interface DrillCatalogProps {
    onImportConfig?: (addPDF: (file: Blob, fileName: string) => Promise<boolean>) => void;
    addPDF: (file: Blob, fileName: string) => Promise<boolean>;
}

export default function DrillCatalog({ addPDF }: DrillCatalogProps) {
    const [customUrl, setCustomUrl] = useState('');
    const [importing, setImporting] = useState(false);
    const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

    // Get API base URL for proxy
    const getApiBaseUrl = (): string => {
        const envUrl = import.meta.env.VITE_API_URL;
        if (envUrl) return envUrl;

        if (typeof window !== 'undefined') {
            const hostname = window.location.hostname;
            if (hostname.endsWith('.github.io')) {
                return 'https://hometeacher-api-736494768812.asia-northeast1.run.app';
            }
            if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
                return 'https://hometeacher-api-736494768812.asia-northeast1.run.app';
            }
        }
        return 'http://localhost:3003';
    };

    const handleImport = async (url: string, fileName: string, isLocal: boolean = false) => {
        setImporting(true);
        setMessage(null);
        try {
            let fetchUrl = url;

            // For external URLs, use proxy to bypass CORS
            if (!isLocal && url.startsWith('http')) {
                const apiBase = getApiBaseUrl();
                fetchUrl = `${apiBase}/api/proxy-pdf?url=${encodeURIComponent(url)}`;
                console.log('📥 Using proxy for external URL:', url);
            }

            const response = await fetch(fetchUrl);
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(errorText || `Failed to fetch: ${response.statusText}`);
            }
            const blob = await response.blob();

            const success = await addPDF(blob, fileName);
            if (success) {
                setMessage({ text: `Successfully imported: ${fileName}`, type: 'success' });
            } else {
                setMessage({ text: 'Failed to save PDF', type: 'error' });
            }
        } catch (error) {
            console.error(error);
            setMessage({ text: `Failed to download PDF: ${error instanceof Error ? error.message : 'Unknown error'}`, type: 'error' });
        } finally {
            setImporting(false);
        }
    };

    const handleCustomImport = () => {
        if (!customUrl) return;
        const fileName = customUrl.split('/').pop() || 'downloaded.pdf';
        handleImport(customUrl, fileName, false);
    };

    return (
        <div className="drill-catalog" style={{ padding: '20px' }}>
            <h2>Drill Catalog</h2>

            {message && (
                <div style={{
                    padding: '10px',
                    marginBottom: '20px',
                    borderRadius: '5px',
                    backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
                    color: message.type === 'success' ? '#155724' : '#721c24'
                }}>
                    {message.text}
                </div>
            )}

            <div className="section" style={{ marginBottom: '30px' }}>
                <h3>Official Drills</h3>
                <div className="drill-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                    {OFFICIAL_DRILLS.map((drill) => (
                        <div key={drill.file} style={{ border: '1px solid #ddd', borderRadius: '8px', padding: '15px', backgroundColor: 'white' }}>
                            <h4 style={{ margin: '0 0 10px 0' }}>{drill.title}</h4>
                            <p style={{ fontSize: '14px', color: '#666' }}>{drill.description}</p>
                            <button
                                onClick={() => handleImport(`./drills/${drill.file}`, drill.file, true)}
                                disabled={importing}
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    backgroundColor: '#3498db',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    opacity: importing ? 0.7 : 1
                                }}
                            >
                                {importing ? 'Importing...' : 'Get Drill'}
                            </button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="section">
                <h3>Import from URL</h3>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <input
                        type="text"
                        value={customUrl}
                        onChange={(e) => setCustomUrl(e.target.value)}
                        placeholder="https://example.com/drill.pdf"
                        style={{ flex: 1, padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
                    />
                    <button
                        onClick={handleCustomImport}
                        disabled={importing || !customUrl}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: '#27ae60',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer'
                        }}
                    >
                        Import
                    </button>
                </div>
                <p style={{ fontSize: '12px', color: '#888', marginTop: '5px' }}>
                    Note: External URLs might fail due to CORS. If it fails, please download the file and use the "+ PDF" button in the library.
                </p>
            </div>
        </div>
    );
}
