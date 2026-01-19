// On-screen debug logger for iPad debugging
// Direct DOM write - bypasses console.log entirely

let debugDiv: HTMLDivElement | null = null
const logs: string[] = []
const MAX_LOGS = 100

export function initDebugLogger() {
    debugDiv = document.createElement('div')
    debugDiv.id = 'debug-logger'
    debugDiv.style.cssText = `
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: 320px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.85);
    color: #0f0;
    font-family: monospace;
    font-size: 7px;
    padding: 5px;
    z-index: 99999;
    pointer-events: none;
    line-height: 1.0;
    border-left: 2px solid #0f0;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  `
    document.body.appendChild(debugDiv)

    log('🚀 Debug Logger Ready')
}

export function log(message: string, data?: any) {
    const timestamp = new Date().toISOString().split('T')[1].substring(0, 12)
    let logMessage = `[${timestamp}] ${message}`

    if (data) {
        try {
            const dataStr = typeof data === 'object' ? JSON.stringify(data) : String(data)
            logMessage += ` ${dataStr}`
        } catch (e) {
            logMessage += ' [object]'
        }
    }

    logs.push(logMessage)

    // Keep only last MAX_LOGS
    if (logs.length > MAX_LOGS) {
        logs.shift()
    }

    updateDisplay()
}

function updateDisplay() {
    if (debugDiv) {
        debugDiv.innerHTML = logs.join('<br>')
        debugDiv.scrollTop = debugDiv.scrollHeight
    }
}

export function clearLog() {
    logs.length = 0
    updateDisplay()
}

export function hideLogger() {
    if (debugDiv) {
        debugDiv.style.display = 'none'
    }
}

export function showLogger() {
    if (debugDiv) {
        debugDiv.style.display = 'block'
    }
}
