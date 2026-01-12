import { useState, useEffect } from 'react'
import { requestPersistentStorage, getStorageEstimate, getPlatformInfo, getStorageAdviceMessage } from '../../utils/storageManager'
import { useTranslation } from 'react-i18next'

export const useStorage = () => {
  const { t } = useTranslation()
  const [storageInfo, setStorageInfo] = useState<{
    isPersisted: boolean
    usageMB: number
    quotaMB: number
    usagePercent: number
  } | null>(null)

  const initializeStorage = async () => {
    try {
      const isPersisted = await requestPersistentStorage()
      const estimate = await getStorageEstimate()

      if (estimate) {
        setStorageInfo({
          isPersisted,
          usageMB: estimate.usageMB,
          quotaMB: estimate.quotaMB,
          usagePercent: estimate.usagePercent,
        })
      }

      const platformInfo = getPlatformInfo()
      const advice = getStorageAdviceMessage(isPersisted, platformInfo)

      if (advice.severity === 'warning' && !isPersisted) {
        console.warn(advice.title, advice.message)
      }
    } catch (error) {
      console.error('Failed to initialize storage:', error)
    }
  }

  const clearAllStorage = async () => {
    if (!confirm(t('storage.deleteConfirm'))) {
      return
    }

    try {
      await new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase('TutoTutoDB')
        request.onsuccess = () => resolve()
        request.onerror = () => reject(new Error('データベースの削除に失敗しました'))
      })

      window.location.reload()
    } catch (error) {
      console.error('ストレージのクリアに失敗:', error)
      throw error
    }
  }

  return {
    storageInfo,
    initializeStorage,
    clearAllStorage
  }
}
