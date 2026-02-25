import { jsPDF } from 'jspdf';
import { PDFDocument } from 'pdf-lib';

/**
 * 画像データの型定義
 */
export interface ImageData {
    blob: Blob;
    thumbnail: string;
    originalName: string;
}

/**
 * 画像をPDFページとして追加するための情報
 */
interface ImagePageInfo {
    dataUrl: string;
    width: number;
    height: number;
}

/**
 * BlobをData URLに変換
 */
function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

/**
 * 画像のサイズを取得
 */
function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.width, height: img.height });
        img.onerror = reject;
        img.src = dataUrl;
    });
}

/**
 * 複数の画像を1つのPDFに変換
 * 
 * @param images - 変換する画像データの配列
 * @param fileName - 出力PDFファイル名（デフォルト: 'document.pdf'）
 * @returns PDFのBlobデータ
 */
export async function convertImagesToPDF(
    images: ImageData[],
    fileName: string = 'document.pdf'
): Promise<Blob> {
    if (images.length === 0) {
        throw new Error('画像が選択されていません');
    }

    try {
        // jsPDFインスタンスを作成（最初の画像のサイズで初期化）
        const firstImageDataUrl = await blobToDataURL(images[0].blob);
        const firstImageDimensions = await getImageDimensions(firstImageDataUrl);

        // A4サイズ基準でPDFを作成
        const pdf = new jsPDF({
            orientation: firstImageDimensions.width > firstImageDimensions.height ? 'landscape' : 'portrait',
            unit: 'px',
            format: 'a4',
        });

        // 最初のページは自動的に作成されるので、最初の画像を追加
        await addImageToPDF(pdf, firstImageDataUrl, firstImageDimensions, true);

        // 残りの画像を追加
        for (let i = 1; i < images.length; i++) {
            const dataUrl = await blobToDataURL(images[i].blob);
            const dimensions = await getImageDimensions(dataUrl);

            // 新しいページを追加
            pdf.addPage(
                'a4',
                dimensions.width > dimensions.height ? 'landscape' : 'portrait'
            );

            await addImageToPDF(pdf, dataUrl, dimensions, false);
        }

        // PDFをBlobとして出力
        const pdfBlob = pdf.output('blob');
        return pdfBlob;
    } catch (error) {
        console.error('PDF conversion failed:', error);
        throw new Error('PDFへの変換に失敗しました');
    }
}

/**
 * PDFに画像を追加（ページに合わせてリサイズ）
 */
async function addImageToPDF(
    pdf: jsPDF,
    dataUrl: string,
    dimensions: { width: number; height: number },
    isFirstPage: boolean
): Promise<void> {
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();

    // 画像をページに収まるようにスケーリング
    const widthRatio = pageWidth / dimensions.width;
    const heightRatio = pageHeight / dimensions.height;
    const ratio = Math.min(widthRatio, heightRatio);

    const scaledWidth = dimensions.width * ratio;
    const scaledHeight = dimensions.height * ratio;

    // 中央配置
    const x = (pageWidth - scaledWidth) / 2;
    const y = (pageHeight - scaledHeight) / 2;

    pdf.addImage(dataUrl, 'JPEG', x, y, scaledWidth, scaledHeight);
}

/**
 * 複数のPDFファイルを結合
 * 
 * @param pdfBlobs - 結合するPDFのBlob配列
 * @returns 結合されたPDFのBlob
 */
export async function mergePDFs(pdfBlobs: Blob[]): Promise<Blob> {
    if (pdfBlobs.length === 0) {
        throw new Error('PDFが選択されていません');
    }

    if (pdfBlobs.length === 1) {
        return pdfBlobs[0];
    }

    try {
        // 最初のPDFをベースとして使用
        const mergedPdf = await PDFDocument.create();

        for (const blob of pdfBlobs) {
            const arrayBuffer = await blob.arrayBuffer();
            const pdf = await PDFDocument.load(arrayBuffer);
            const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());

            copiedPages.forEach((page) => {
                mergedPdf.addPage(page);
            });
        }

        const mergedPdfBytes = await mergedPdf.save();
        return new Blob([mergedPdfBytes as any], { type: 'application/pdf' });
    } catch (error) {
        console.error('PDF merge failed:', error);
        throw new Error('PDFの結合に失敗しました');
    }
}

/**
 * 画像とPDFを混在させて1つのPDFに結合
 * 
 * @param items - 画像データまたはPDF Blobの配列
 * @param fileName - 出力ファイル名
 * @returns 結合されたPDFのBlob
 */
export async function combineImagesAndPDFs(
    items: Array<ImageData | Blob>,
    fileName: string = 'combined.pdf'
): Promise<Blob> {
    const pdfBlobs: Blob[] = [];

    for (const item of items) {
        if (item instanceof Blob && item.type === 'application/pdf') {
            // すでにPDFの場合はそのまま追加
            pdfBlobs.push(item);
        } else if ('blob' in item) {
            // ImageDataの場合はPDFに変換
            const pdfBlob = await convertImagesToPDF([item], fileName);
            pdfBlobs.push(pdfBlob);
        }
    }

    return await mergePDFs(pdfBlobs);
}

/**
 * PDFのページ数を取得
 */
export async function getPDFPageCount(blob: Blob): Promise<number> {
    try {
        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        return pdf.getPageCount();
    } catch (error) {
        console.error('Failed to get PDF page count:', error);
        return 0;
    }
}
