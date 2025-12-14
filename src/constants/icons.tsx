// アイコンSVGの定義
export const ICON_SVG = {
  // ペンアイコン（ボタン用）
  pen: (isActive: boolean, color: string) => (
    <svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 24 24'>
      <path fill={isActive ? 'white' : color} d='M3,17.25V21h3.75L17.81,9.94l-3.75-3.75L3,17.25z M20.71,7.04c0.39-0.39,0.39-1.02,0-1.41l-2.34-2.34 c-0.39-0.39-1.02-0.39-1.41,0l-1.83,1.83l3.75,3.75L20.71,7.04z' />
    </svg>
  ),
  // 消しゴムアイコン（ボタン用）
  eraser: (isActive: boolean) => (
    <svg xmlns='http://www.w3.org/2000/svg' width='26' height='26' viewBox='0 0 24 24'>
      <rect fill={isActive ? 'white' : '#2196F3'} x='5' y='3' width='14' height='14' rx='1' />
      <rect fill={isActive ? '#4CAF50' : 'white'} stroke={isActive ? 'white' : '#666'} strokeWidth='1' x='6' y='17' width='12' height='4' rx='0.5' />
      <line stroke={isActive ? 'white' : '#1976D2'} strokeWidth='0.5' x1='7' y1='10' x2='17' y2='10' />
    </svg>
  ),
  // ペンカーソル（Data URL用）
  penCursor: (color: string) => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='${color}' d='M3,17.25V21h3.75L17.81,9.94l-3.75-3.75L3,17.25z M20.71,7.04c0.39-0.39,0.39-1.02,0-1.41l-2.34-2.34 c-0.39-0.39-1.02-0.39-1.41,0l-1.83,1.83l3.75,3.75L20.71,7.04z'/></svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 2 20, crosshair`
  },
  // 消しゴムカーソル（Data URL用）
  eraserCursor: (() => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><rect fill='#2196F3' x='5' y='3' width='14' height='14' rx='1'/><rect fill='white' stroke='#666' stroke-width='1' x='6' y='17' width='12' height='4' rx='0.5'/><line stroke='#1976D2' stroke-width='0.5' x1='7' y1='10' x2='17' y2='10'/></svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 12 12, pointer`
  })()
} as const
