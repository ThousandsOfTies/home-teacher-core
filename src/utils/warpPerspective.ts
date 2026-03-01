/**
 * Performs a perspective transform on a canvas image.
 * This is a lightweight implementation using HTML5 Canvas triangulation,
 * ensuring no heavy dependencies (like OpenCV or WebGL) are strictly necessary.
 * 
 * In the future, this can be swapped out with OpenCV.js or glfx if higher precision
 * or performance on massive images is required.
 */

// Helper to calculate perspective transform matrix
// Translates 4 points to 4 points
function getPerspectiveTransform(src: number[], dst: number[]): number[] {
    const a = [
        [src[0], src[1], 1, 0, 0, 0, -src[0] * dst[0], -src[1] * dst[0]],
        [0, 0, 0, src[0], src[1], 1, -src[0] * dst[1], -src[1] * dst[1]],
        [src[2], src[3], 1, 0, 0, 0, -src[2] * dst[2], -src[3] * dst[2]],
        [0, 0, 0, src[2], src[3], 1, -src[2] * dst[3], -src[3] * dst[3]],
        [src[4], src[5], 1, 0, 0, 0, -src[4] * dst[4], -src[5] * dst[4]],
        [0, 0, 0, src[4], src[5], 1, -src[4] * dst[5], -src[5] * dst[5]],
        [src[6], src[7], 1, 0, 0, 0, -src[6] * dst[6], -src[7] * dst[6]],
        [0, 0, 0, src[6], src[7], 1, -src[6] * dst[7], -src[7] * dst[7]]
    ];
    const b = [dst[0], dst[1], dst[2], dst[3], dst[4], dst[5], dst[6], dst[7]];

    // Gaussian elimination with partial pivoting
    for (let i = 0; i < 8; i++) {
        let maxRow = i;
        for (let j = i + 1; j < 8; j++) {
            if (Math.abs(a[j][i]) > Math.abs(a[maxRow][i])) {
                maxRow = j;
            }
        }

        // Swap rows
        const tmpA = a[i]; a[i] = a[maxRow]; a[maxRow] = tmpA;
        const tmpB = b[i]; b[i] = b[maxRow]; b[maxRow] = tmpB;

        // Skip if pivot is effectively zero (singular matrix handling)
        if (Math.abs(a[i][i]) < 1e-10) {
            continue;
        }

        for (let j = i + 1; j < 8; j++) {
            const factor = a[j][i] / a[i][i];
            for (let k = i; k < 8; k++) {
                a[j][k] -= a[i][k] * factor;
            }
            b[j] -= b[i] * factor;
        }
    }

    const x = new Array(8).fill(0);
    for (let i = 7; i >= 0; i--) {
        let sum = 0;
        for (let j = i + 1; j < 8; j++) {
            sum += a[i][j] * x[j];
        }
        if (Math.abs(a[i][i]) > 1e-10) {
            x[i] = (b[i] - sum) / a[i][i];
        }
    }

    return [...x, 1];
}

/**
 * Warp image using a perspective mapping.
 * @param sourceCanvas HTMLCanvasElement of original image
 * @param srcCorners [x0,y0, x1,y1, x2,y2, x3,y3] (top-left, top-right, bottom-right, bottom-left)
 * @param dstWidth Output width
 * @param dstHeight Output height
 */
export async function warpPerspectiveCanvas(
    sourceCanvas: HTMLCanvasElement,
    srcCorners: number[],
    dstWidth: number,
    dstHeight: number
): Promise<HTMLCanvasElement> {
    dstWidth = Math.round(dstWidth);
    dstHeight = Math.round(dstHeight);

    if (dstWidth <= 0 || dstHeight <= 0) {
        console.error("Invalid destination dimensions:", dstWidth, dstHeight);
        return sourceCanvas;
    }

    const dstCorners = [
        0, 0,
        dstWidth, 0,
        dstWidth, dstHeight,
        0, dstHeight
    ];

    const resultCanvas = document.createElement('canvas');
    resultCanvas.width = dstWidth;
    resultCanvas.height = dstHeight;
    const ctx = resultCanvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return resultCanvas;

    const srcCtx = sourceCanvas.getContext('2d', { willReadFrequently: true });
    if (!srcCtx) return resultCanvas;

    const srcData = srcCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
    const dstData = ctx.createImageData(dstWidth, dstHeight);

    // transform maps from DESTINATION to SOURCE
    const transform = getPerspectiveTransform(dstCorners, srcCorners);

    console.log("Warp Info:", { dstWidth, dstHeight, dstCorners, srcCorners, transform });

    if (!transform) {
        console.warn("Warp transformation matrix is singular.");
        return sourceCanvas;
    }

    const sWidth = sourceCanvas.width;
    const sHeight = sourceCanvas.height;

    // optimize by extracting matrix elements
    const [t0, t1, t2, t3, t4, t5, t6, t7, t8] = transform;

    const dstBuf32 = new Uint32Array(dstData.data.buffer);
    const srcBuf32 = new Uint32Array(srcData.data.buffer);

    // Limit maximum dimensions just in case, browsers drop canvases > ~16k
    if (dstWidth > 8000 || dstHeight > 8000) {
        console.warn("Warp dimension too large, downscaling...", dstWidth, dstHeight);
        /* Scale down logic or reject could be here, but let's simply limit loop for now */
    }

    const maxW = Math.min(dstWidth, 8000);
    const maxH = Math.min(dstHeight, 8000);

    for (let y = 0; y < maxH; y++) {
        for (let x = 0; x < maxW; x++) {
            // Map point from destination to source
            const w = t6 * x + t7 * y + t8;
            const sx = (t0 * x + t1 * y + t2) / w;
            const sy = (t3 * x + t4 * y + t5) / w;

            const dstIdx = y * dstWidth + x;

            if (isNaN(sx) || isNaN(sy)) {
                dstBuf32[dstIdx] = 0xFFFFFFFF;
                continue;
            }

            // Bilinear interpolation for smoother results on heavy warps
            const dx = sx - Math.floor(sx);
            const dy = sy - Math.floor(sy);
            const mdx = 1 - dx;
            const mdy = 1 - dy;

            const x0 = Math.floor(sx);
            const y0 = Math.floor(sy);
            const x1 = x0 + 1;
            const y1 = y0 + 1;

            // Bounds check
            if (x0 >= 0 && x1 < sWidth && y0 >= 0 && y1 < sHeight) {
                const idx00 = y0 * sWidth + x0;
                const idx01 = idx00 + 1;
                const idx10 = y1 * sWidth + x0;
                const idx11 = idx10 + 1;

                const p00 = srcBuf32[idx00];
                const p01 = srcBuf32[idx01];
                const p10 = srcBuf32[idx10];
                const p11 = srcBuf32[idx11];

                const r = mdy * (mdx * (p00 & 0xff) + dx * (p01 & 0xff)) +
                    dy * (mdx * (p10 & 0xff) + dx * (p11 & 0xff));

                const g = mdy * (mdx * ((p00 >> 8) & 0xff) + dx * ((p01 >> 8) & 0xff)) +
                    dy * (mdx * ((p10 >> 8) & 0xff) + dx * ((p11 >> 8) & 0xff));

                const b = mdy * (mdx * ((p00 >> 16) & 0xff) + dx * ((p01 >> 16) & 0xff)) +
                    dy * (mdx * ((p10 >> 16) & 0xff) + dx * ((p11 >> 16) & 0xff));

                const a = mdy * (mdx * ((p00 >> 24) & 0xff) + dx * ((p01 >> 24) & 0xff)) +
                    dy * (mdx * ((p10 >> 24) & 0xff) + dx * ((p11 >> 24) & 0xff));

                dstBuf32[dstIdx] = (r & 0xff) | ((g & 0xff) << 8) | ((b & 0xff) << 16) | ((a & 0xff) << 24);
            } else if (x0 >= 0 && x0 < sWidth && y0 >= 0 && y0 < sHeight) {
                // Edge fallback (nearest neighbor)
                dstBuf32[dstIdx] = srcBuf32[y0 * sWidth + x0];
            } else {
                dstBuf32[dstIdx] = 0xFFFFFFFF; // White in ABGR (little endian)
            }
        }
    }

    ctx.putImageData(dstData, 0, 0);
    return resultCanvas;
}
