// On-screen debug logger for iPad debugging
// Use when Eruda console doesn't work

let debugDiv: HTMLDivElement | null = null
const logs: string[] = []
const MAX_LOGS = 20

export function initDebugLogger() {
    debugDiv = document.createElement('div')
    debugDiv.id = 'debug-logger'
    debugDiv.style.cssText = `
    position: fixed;
    bottom: 60px;
    left: 10px;
    right: 10px;
    max-height: 200px;
    overflow-y: auto;
    background: rgba(0, 0, 0, 0.9);
    color: #0f0;
    font-family: monospace;
    font-size: 10px;
    padding: 5px;
    border-radius: 5px;
    z-index: 99999;
    pointer-events: none;
  `
    document.body.appendChild(debugDiv)

    // Override console.log
    const originalLog = console.log
    console.log = (...args: any[]) => {
        originalLog(...args)
        logToScreen(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '))
    }

    logToScreen('🚀 Debug Logger Initialized')
}

export function logToScreen(message: string) {
    const timestamp = new Date().toISOString().split('T')[1].substring(0, 12)
    logs.push(`[${timestamp}] ${message}`)

    // Keep only last MAX_LOGS
    if (logs.length > MAX_LOGS) {
        logs.shift()
    }

    if (debugDiv) {
        debugDiv.innerHTML = logs.join('<br>')
        debugDiv.scrollTop = debugDiv.scrollHeight
    }
}

export function clearDebugLog() {
    logs.length = 0
    if (debugDiv) {
        debugDiv.innerHTML = ''
    }
}

export function hideDebugLogger() {
    if (debugDiv) {
        debugDiv.style.display = 'none'
    }
}

export function showDebugLogger() {
    if (debugDiv) {
        debugDiv.style.display = 'block'
    }
}
