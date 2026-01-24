
export const compressImage = (canvas: HTMLCanvasElement, maxSize: number = 1024): string => {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    if (canvas.width <= maxSize && canvas.height <= maxSize) {
        return canvas.toDataURL('image/jpeg', isIOS ? 0.7 : 0.8)
    }
    const scale = Math.min(maxSize / canvas.width, maxSize / canvas.height)
    const targetWidth = Math.floor(canvas.width * scale)
    const targetHeight = Math.floor(canvas.height * scale)
    const tempCanvas = document.createElement('canvas')
    tempCanvas.width = targetWidth
    tempCanvas.height = targetHeight
    const tempCtx = tempCanvas.getContext('2d')
    if (!tempCtx) {
        throw new Error('Canvas context creation failed')
    }
    tempCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight)
    return tempCanvas.toDataURL('image/jpeg', isIOS ? 0.7 : 0.8)
}
