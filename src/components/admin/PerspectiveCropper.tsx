import React, { useState, useEffect, useRef } from 'react';

interface PerspectiveCropperProps {
    imageSrc: string;
    initialCorners?: [number, number, number, number, number, number, number, number]; // [x0,y0, x1,y1, x2,y2, x3,y3] in percentage (0~1)
    onChange: (corners: [number, number, number, number, number, number, number, number]) => void;
    onClose: () => void;
}

const DEFAULT_CORNERS: [number, number, number, number, number, number, number, number] = [0, 0, 1, 0, 1, 1, 0, 1];

export const PerspectiveCropper: React.FC<PerspectiveCropperProps> = ({
    imageSrc,
    initialCorners = DEFAULT_CORNERS, // top-left, top-right, bottom-right, bottom-left
    onChange,
    onClose
}) => {
    // Current working corners (in 0-1 percentage relative to image dimensions)
    const [corners, setCorners] = useState<[number, number, number, number, number, number, number, number]>(initialCorners);
    const containerRef = useRef<HTMLDivElement>(null);
    const [draggingIndex, setDraggingIndex] = useState<number | null>(null);

    // Zoom loupe state
    const [loupe, setLoupe] = useState<{ x: number, y: number, show: boolean }>({ x: 0, y: 0, show: false });

    // Removed useEffect that syncs initialCorners to prevent infinite renders.

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, index: number) => {
        e.preventDefault();
        setDraggingIndex(index);
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (draggingIndex === null || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        let x = (e.clientX - rect.left) / rect.width;
        let y = (e.clientY - rect.top) / rect.height;

        // Clamp to 0-1 absolute
        let nx = Math.max(0, Math.min(1, x));
        let ny = Math.max(0, Math.min(1, y));

        // Enforce logical boundaries to prevent concave/crossed polygons
        const minDistance = 0.05; // 5% minimum size to prevent points overlapping
        switch (draggingIndex) {
            case 0: // Top-Left
                nx = Math.min(nx, corners[2] - minDistance);
                ny = Math.min(ny, corners[7] - minDistance);
                break;
            case 1: // Top-Right
                nx = Math.max(nx, corners[0] + minDistance);
                ny = Math.min(ny, corners[5] - minDistance);
                break;
            case 2: // Bottom-Right
                nx = Math.max(nx, corners[6] + minDistance);
                ny = Math.max(ny, corners[3] + minDistance);
                break;
            case 3: // Bottom-Left
                nx = Math.min(nx, corners[4] - minDistance);
                ny = Math.max(ny, corners[1] + minDistance);
                break;
        }

        const newCorners = [...corners] as [number, number, number, number, number, number, number, number];
        newCorners[draggingIndex * 2] = nx;
        newCorners[draggingIndex * 2 + 1] = ny;

        // Update local state for fast UI tracking
        setCorners(newCorners);

        // Update loupe
        setLoupe({
            show: true,
            x: e.clientX,
            y: e.clientY
        });
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        if (draggingIndex !== null) {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            setDraggingIndex(null);
            setLoupe(prev => ({ ...prev, show: false }));
            // Only trigger the costly top-level update ONCE per drag action
            onChange(corners);
        }
    };

    // Calculate path for SVG polygon
    const polygonPoints = `${corners[0] * 100},${corners[1] * 100} ${corners[2] * 100},${corners[3] * 100} ${corners[4] * 100},${corners[5] * 100} ${corners[6] * 100},${corners[7] * 100}`;

    return (
        <div
            style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex', flexDirection: 'column',
                backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 1000
            }}
        >
            <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#2c3e50', color: 'white' }}>
                <div>四隅をドラッグして、ドキュメントの角に合わせてください</div>
                <button onClick={onClose} style={{ padding: '8px 16px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                    完了
                </button>
            </div>

            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative' }}>
                <div ref={containerRef} style={{ position: 'relative', maxWidth: '100%', maxHeight: '100%', display: 'inline-block' }}>

                    {/* The image being cropped */}
                    <img src={imageSrc} style={{ maxWidth: '100%', maxHeight: '70vh', display: 'block', objectFit: 'contain', pointerEvents: 'none', userSelect: 'none' }} />

                    {/* SVG overlay for darkened outside and bordered polygon */}
                    <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }} preserveAspectRatio="none" viewBox="0 0 100 100">
                        <defs>
                            <mask id="crop-mask">
                                <rect width="100" height="100" fill="white" />
                                <polygon points={polygonPoints} fill="black" />
                            </mask>
                        </defs>
                        {/* Darken outside */}
                        <rect width="100" height="100" fill="rgba(0,0,0,0.5)" mask="url(#crop-mask)" />
                        {/* Draw polygon border */}
                        <polygon points={polygonPoints} fill="none" stroke="#2ecc71" strokeWidth="0.5" vectorEffect="non-scaling-stroke" strokeDasharray="2" />
                    </svg>

                    {/* Drag handles (4 corners) */}
                    {[0, 1, 2, 3].map(i => {
                        const cx = corners[i * 2] * 100;
                        const cy = corners[i * 2 + 1] * 100;
                        return (
                            <div
                                key={i}
                                onPointerDown={(e) => handlePointerDown(e, i)}
                                onPointerMove={handlePointerMove}
                                onPointerUp={handlePointerUp}
                                style={{
                                    position: 'absolute',
                                    left: `${cx}%`,
                                    top: `${cy}%`,
                                    width: '30px',
                                    height: '30px',
                                    transform: 'translate(-50%, -50%)',
                                    backgroundColor: 'white',
                                    border: '3px solid #3498db',
                                    borderRadius: '50%',
                                    cursor: 'move',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                                    touchAction: 'none' // Prevent scrolling on touch devices
                                }}
                            />
                        );
                    })}
                </div>
            </div>

            {/* Loupe Mode (Magnifying Glass) */}
            {loupe.show && (
                <div style={{
                    position: 'fixed',
                    left: loupe.x - 60,
                    top: loupe.y - 140, // offset above finger
                    width: '120px',
                    height: '120px',
                    borderRadius: '50%',
                    border: '4px solid #3498db',
                    overflow: 'hidden',
                    backgroundColor: 'white',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                    zIndex: 1001,
                    pointerEvents: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                }}>
                    <img
                        src={imageSrc}
                        style={{
                            position: 'absolute',
                            maxWidth: 'none',
                            // The loupe magnifies by 2x. We need to focus on the area directly under the finger.
                            width: containerRef.current ? `${containerRef.current.offsetWidth * 2}px` : 'auto',
                            height: containerRef.current ? `${containerRef.current.offsetHeight * 2}px` : 'auto',
                            // Calculate offset based on the ratio of pointer inside the container
                            left: containerRef.current ? `-${(loupe.x - containerRef.current.getBoundingClientRect().left) * 2 - 60}px` : 0,
                            top: containerRef.current ? `-${(loupe.y - containerRef.current.getBoundingClientRect().top) * 2 - 60}px` : 0,
                        }}
                    />
                    <div style={{ position: 'absolute', width: '20px', height: '1px', backgroundColor: '#e74c3c' }} />
                    <div style={{ position: 'absolute', width: '1px', height: '20px', backgroundColor: '#e74c3c' }} />
                </div>
            )}
        </div>
    );
};
