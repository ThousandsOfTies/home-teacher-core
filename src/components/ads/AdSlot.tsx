import React, { useEffect } from 'react'
import './AdSlot.css'

interface AdSlotProps {
  slot: 'admin-top' | 'admin-sidebar' | 'result-bottom' | 'result-top'
  className?: string
}

/**
 * Google AdSense広告スロット
 *
 * AdSense承認後、以下の手順で広告を有効化：
 * 1. public/index.htmlに AdSense スクリプトを追加
 * 2. VITE_ADSENSE_CLIENT_ID を .env に設定
 * 3. 各スロットのdata-ad-slotを設定
 */
const AdSlot: React.FC<AdSlotProps> = ({ slot, className = '' }) => {
  const adClientId = import.meta.env.VITE_ADSENSE_CLIENT_ID
  const isAdEnabled = !!adClientId

  useEffect(() => {
    if (isAdEnabled && typeof window !== 'undefined' && (window as any).adsbygoogle) {
      try {
        // AdSenseの広告をロード
        ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({})
      } catch (error) {
        console.error('AdSense load error:', error)
      }
    }
  }, [isAdEnabled])

  const getSlotConfig = () => {
    switch (slot) {
      case 'admin-top':
        return {
          title: '管理画面 - トップバナー',
          style: { minHeight: '90px' },
          format: 'horizontal' as const
        }
      case 'admin-sidebar':
        return {
          title: '管理画面 - サイドバー',
          style: { minHeight: '250px' },
          format: 'rectangle' as const
        }
      case 'result-bottom':
        return {
          title: '採点結果 - 下部',
          style: { minHeight: '250px' },
          format: 'rectangle' as const
        }
      case 'result-top':
        return {
          title: '採点結果 - 上部バナー',
          style: { minHeight: '90px' },
          format: 'horizontal' as const
        }
    }
  }

  const config = getSlotConfig()

  if (!isAdEnabled) {
    // AdSense未設定時: プレースホルダーを表示
    return (
      <div className={`ad-slot ad-placeholder ${className}`} style={config.style}>
        <div className="ad-placeholder-content">
          <span className="ad-label">広告スペース</span>
          <span className="ad-slot-name">{config.title}</span>
          <span className="ad-hint">AdSense承認後に広告が表示されます</span>
        </div>
      </div>
    )
  }

  // AdSense設定済み: 実際の広告を表示
  return (
    <div className={`ad-slot ${className}`}>
      <ins
        className="adsbygoogle"
        style={{ display: 'block', ...config.style }}
        data-ad-client={adClientId}
        data-ad-slot={slot} // 実際のスロットIDに置き換える
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}

export default AdSlot
