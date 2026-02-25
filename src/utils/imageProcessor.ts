import heic2any from 'heic2any';

/**
 * サポートされている画像形式
 */
export const SUPPORTED_IMAGE_FORMATS = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/heic',
    'image/heif',
] as const;

/**
 * サポートされているファイル拡張子
 */
export const SUPPORTED_IMAGE_EXTENSIONS = [
    '.jpg',
    '.jpeg',
    '.png',
    '.heic',
    '.heif',
] as const;

/**
 * ファイルがサポートされている画像形式かチェック
 */
export function isSupportedImageFile(file: File): boolean {
    const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
    return SUPPORTED_IMAGE_EXTENSIONS.includes(extension as any) ||
        SUPPORTED_IMAGE_FORMATS.includes(file.type as any);
}

/**
 * HEIC/HEIF形式をJPEGに変換
 */
export async function convertHeicToJpeg(file: File): Promise<Blob> {
    try {
        const result = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.9,
        });

        // heic2anyは配列またはBlobを返す可能性がある
        if (Array.isArray(result)) {
            return result[0];
        }
        return result;
    } catch (error) {
        console.error('HEIC conversion failed:', error);
        throw new Error('HEIC形式の変換に失敗しました');
    }
}

/**
 * 画像ファイルを標準形式（JPEG/PNG）に変換
 * HEIC/HEIFの場合はJPEGに変換、それ以外はそのまま返す
 */
export async function normalizeImageFile(file: File): Promise<Blob> {
    const isHeic = file.type === 'image/heic' ||
        file.type === 'image/heif' ||
        file.name.toLowerCase().endsWith('.heic') ||
        file.name.toLowerCase().endsWith('.heif');

    if (isHeic) {
        return await convertHeicToJpeg(file);
    }

    return file;
}

/**
 * 画像をCanvasにロード
 */
export function loadImageToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);

        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
                URL.revokeObjectURL(url);
                reject(new Error('Canvas context not available'));
                return;
            }

            ctx.drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve(canvas);
        };

        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('画像の読み込みに失敗しました'));
        };

        img.src = url;
    });
}

/**
 * 画像をリサイズ（最大サイズ指定）
 */
export async function resizeImage(
    blob: Blob,
    maxWidth: number = 2048,
    maxHeight: number = 2048,
    quality: number = 0.9
): Promise<Blob> {
    const canvas = await loadImageToCanvas(blob);
    const { width, height } = canvas;

    // リサイズが必要かチェック
    if (width <= maxWidth && height <= maxHeight) {
        return blob;
    }

    // アスペクト比を保持してリサイズ
    let newWidth = width;
    let newHeight = height;

    if (width > maxWidth) {
        newWidth = maxWidth;
        newHeight = (height * maxWidth) / width;
    }

    if (newHeight > maxHeight) {
        newHeight = maxHeight;
        newWidth = (width * maxHeight) / height;
    }

    // 新しいCanvasにリサイズして描画
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = newWidth;
    resizedCanvas.height = newHeight;

    const ctx = resizedCanvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas context not available');
    }

    ctx.drawImage(canvas, 0, 0, newWidth, newHeight);

    return new Promise((resolve, reject) => {
        resizedCanvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('画像のリサイズに失敗しました'));
                }
            },
            'image/jpeg',
            quality
        );
    });
}

/**
 * 画像を回転
 */
export async function rotateImage(blob: Blob, degrees: number): Promise<Blob> {
    const canvas = await loadImageToCanvas(blob);
    const { width, height } = canvas;

    // 90度または270度の回転の場合、幅と高さを入れ替える
    const needsSwap = degrees === 90 || degrees === 270;
    const newWidth = needsSwap ? height : width;
    const newHeight = needsSwap ? width : height;

    const rotatedCanvas = document.createElement('canvas');
    rotatedCanvas.width = newWidth;
    rotatedCanvas.height = newHeight;

    const ctx = rotatedCanvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas context not available');
    }

    // 中心を原点として回転
    ctx.translate(newWidth / 2, newHeight / 2);
    ctx.rotate((degrees * Math.PI) / 180);
    ctx.drawImage(canvas, -width / 2, -height / 2);

    return new Promise((resolve, reject) => {
        rotatedCanvas.toBlob(
            (blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('画像の回転に失敗しました'));
                }
            },
            'image/jpeg',
            0.9
        );
    });
}

/**
 * サムネイル生成
 */
export async function generateThumbnail(
    blob: Blob,
    maxSize: number = 200
): Promise<string> {
    const canvas = await loadImageToCanvas(blob);
    const { width, height } = canvas;

    // アスペクト比を保持してサムネイルサイズを計算
    let thumbWidth = width;
    let thumbHeight = height;

    if (width > height) {
        thumbWidth = maxSize;
        thumbHeight = (height * maxSize) / width;
    } else {
        thumbHeight = maxSize;
        thumbWidth = (width * maxSize) / height;
    }

    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = thumbWidth;
    thumbCanvas.height = thumbHeight;

    const ctx = thumbCanvas.getContext('2d');
    if (!ctx) {
        throw new Error('Canvas context not available');
    }

    ctx.drawImage(canvas, 0, 0, thumbWidth, thumbHeight);

    return thumbCanvas.toDataURL('image/jpeg', 0.7);
}

/**
 * 複数の画像ファイルを処理
 */
export async function processImageFiles(
    files: File[]
): Promise<Array<{ blob: Blob; thumbnail: string; originalName: string }>> {
    const results = [];

    console.log(`🖼️  Processing ${files.length} image file(s)...`)

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            console.log(`  [${i + 1}/${files.length}] Processing: ${file.name}`)

            // HEIC変換など
            console.log(`    - Normalizing format...`)
            const normalized = await normalizeImageFile(file);
            console.log(`    - Format normalized (${(normalized.size / 1024).toFixed(1)}KB)`)

            // リサイズ（メモリ節約のため）
            console.log(`    - Resizing...`)
            const resized = await resizeImage(normalized);
            console.log(`    - Resized (${(resized.size / 1024).toFixed(1)}KB)`)

            // サムネイル生成
            console.log(`    - Generating thumbnail...`)
            const thumbnail = await generateThumbnail(resized);
            console.log(`    - Thumbnail generated`)

            results.push({
                blob: resized,
                thumbnail,
                originalName: file.name,
            });

            console.log(`    ✅ Completed: ${file.name}`)
        } catch (error) {
            console.error(`    ❌ Failed to process ${file.name}:`, error);
            throw error;
        }
    }

    console.log(`✅ All ${files.length} images processed successfully`)
    return results;
}
