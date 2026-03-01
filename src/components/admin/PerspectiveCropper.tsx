import React, { useState, useRef } from 'react';

export type Corners = [number, number, number, number, number, number, number, number];

interface PerspectiveCropperProps {
    /** Corners in normalized 0-1 coords: [tl_x, tl_y, tr_x, tr_y, br_x, br_y, bl_x, bl_y] */
    corners: Corners;
    onChange: (corners: Corners) => void;
    disabled?: boolean;
}

const MIN_DIST = 0.01;

/**
 * Lightweight inline overlay that shows 4 draggable corner handles + polygon outline.
 * Meant to be positioned absolute over an image with position:relative parent.
 * No fullscreen, no dark background, no close button.
 */
export const PerspectiveCropper: React.FC<PerspectiveCropperProps> = ({
    corners,
    onChange,
    disabled = false
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const draggingRef = useRef<number | null>(null);

    const handlePointerDown = (e: React.PointerEvent, index: number) => {
        if (disabled) return;
        e.preventDefault();
        e.stopPropagation();
        draggingRef.current = index;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (draggingRef.current === null || !containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const i = draggingRef.current;

        let nx = (e.clientX - rect.left) / rect.width;
        let ny = (e.clientY - rect.top) / rect.height;

        // Clamp 0-1
        nx = Math.max(0, Math.min(1, nx));
        ny = Math.max(0, Math.min(1, ny));

        // Logical constraints to prevent crossing
        switch (i) {
            case 0: // Top-Left
                nx = Math.min(nx, corners[2] - MIN_DIST);
                ny = Math.min(ny, corners[7] - MIN_DIST);
                break;
            case 1: // Top-Right
                nx = Math.max(nx, corners[0] + MIN_DIST);
                ny = Math.min(ny, corners[5] - MIN_DIST);
                break;
            case 2: // Bottom-Right
                nx = Math.max(nx, corners[6] + MIN_DIST);
                ny = Math.max(ny, corners[3] + MIN_DIST);
                break;
            case 3: // Bottom-Left
                nx = Math.min(nx, corners[4] - MIN_DIST);
                ny = Math.max(ny, corners[1] + MIN_DIST);
                break;
        }

        const newCorners = [...corners] as Corners;
        newCorners[i * 2] = nx;
        newCorners[i * 2 + 1] = ny;
        onChange(newCorners);
    };

    const handlePointerUp = (e: React.PointerEvent) => {
        if (draggingRef.current !== null) {
            (e.target as HTMLElement).releasePointerCapture(e.pointerId);
            draggingRef.current = null;
        }
    };

    // SVG polygon points (percentage coords within viewBox 0-100)
    const polygonPoints = [0, 1, 2, 3, 4, 5, 6, 7]
        .reduce<number[]>((acc, idx) => {
            acc.push(corners[idx]);
            return acc;
        }, [])
        .map((v, i) => v * 100)
        .reduce<string[]>((acc, v, i) => {
            if (i % 2 === 0) acc.push(`${v}`);
            else acc[acc.length - 1] += `,${v}`;
            return acc;
        }, [])
        .join(' ');

    const HANDLE_R = 1.8; // radius % of viewBox
    const HANDLE_LABELS = ['', '', '', ''];

    return (
        <div
            ref={containerRef}
            style={{
                position: 'absolute',
                top: 0, left: 0,
                width: '100%', height: '100%',
                overflow: 'visible',
                touchAction: 'none',
                zIndex: 20
            }}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
        >
            <svg
                style={{
                    position: 'absolute',
                    top: 0, left: 0,
                    width: '100%', height: '100%',
                    pointerEvents: 'none'
                }}
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
            >
                {/* Dim outside the rectangle */}
                <defs>
                    <mask id="perspective-crop-mask">
                        <rect width="100" height="100" fill="white" />
                        <polygon points={polygonPoints} fill="black" />
                    </mask>
                </defs>
                <rect
                    width="100" height="100"
                    fill="rgba(0,0,0,0.35)"
                    mask="url(#perspective-crop-mask)"
                />

                {/* Polygon border */}
                <polygon
                    points={polygonPoints}
                    fill="none"
                    stroke="#2ecc71"
                    strokeWidth="0.5"
                    vectorEffect="non-scaling-stroke"
                    strokeDasharray="3 2"
                />
            </svg>

            {/* HTML Corner handles for perfect circles */}
            {[0, 1, 2, 3].map(i => {
                const left = corners[i * 2] * 100;
                const top = corners[i * 2 + 1] * 100;
                return (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            left: `${left}%`,
                            top: `${top}%`,
                            width: '24px',
                            height: '24px',
                            marginLeft: '-12px',
                            marginTop: '-12px',
                            backgroundColor: 'white',
                            border: '2px solid #3498db',
                            borderRadius: '50%',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                            cursor: disabled ? 'default' : 'move',
                            pointerEvents: 'auto',
                            touchAction: 'none',
                            zIndex: 30
                        }}
                        onPointerDown={(e) => handlePointerDown(e, i)}
                    />
                );
            })}
        </div>
    );
};

export const DEFAULT_CORNERS: Corners = [0, 0, 1, 0, 1, 1, 0, 1];
