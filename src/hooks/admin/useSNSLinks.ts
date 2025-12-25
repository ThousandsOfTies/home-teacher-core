import { useState } from 'react'
import { getAllSNSLinks, deleteSNSLink, saveSNSLink, SNSLinkRecord } from '../../utils/indexedDB'
import { PREDEFINED_SNS } from '../../constants/sns'

export const useSNSLinks = () => {
  const [snsLinks, setSnsLinks] = useState<SNSLinkRecord[]>([])
  const [selectedSNS, setSelectedSNS] = useState<Set<string>>(new Set())
  const [customUrls, setCustomUrls] = useState<Record<string, string>>({})

  const loadSNSLinks = async () => {
    try {
      const links = await getAllSNSLinks()
      setSnsLinks(links)

      // 既存のSNSリンクから選択状態を復元
      const selected = new Set<string>()
      const urls: Record<string, string> = {}

      links.forEach(link => {
        const predefined = PREDEFINED_SNS.find(sns =>
          sns.name.toLowerCase() === link.name.toLowerCase() ||
          sns.id === link.id
        )

        if (predefined) {
          selected.add(predefined.id)
          if (link.url !== predefined.defaultUrl) {
            urls[predefined.id] = link.url
          }
        }
      })

      setSelectedSNS(selected)
      setCustomUrls(urls)
    } catch (error) {
      console.error('Failed to load SNS links:', error)
    }
  }

  const toggleSNS = (snsId: string) => {
    setSelectedSNS(prev => {
      const newSet = new Set(prev)
      if (newSet.has(snsId)) {
        newSet.delete(snsId)
        setCustomUrls(urls => {
          const newUrls = { ...urls }
          delete newUrls[snsId]
          return newUrls
        })
      } else {
        newSet.add(snsId)
      }
      return newSet
    })
  }

  const updateCustomUrl = (snsId: string, url: string) => {
    setCustomUrls(prev => ({
      ...prev,
      [snsId]: url
    }))
  }

  const saveSNSSettings = async () => {
    try {
      // 既存のすべてのSNSリンクを削除
      for (const link of snsLinks) {
        await deleteSNSLink(link.id)
      }

      // 選択されたSNSを保存
      for (const snsId of selectedSNS) {
        const sns = PREDEFINED_SNS.find(s => s.id === snsId)
        if (!sns) continue

        const url = customUrls[snsId] || sns.defaultUrl
        const newLink: SNSLinkRecord = {
          id: snsId,
          name: sns.name,
          url: url,
          icon: sns.icon,
          createdAt: Date.now()
        }
        await saveSNSLink(newLink)
      }

      await loadSNSLinks()
    } catch (error) {
      console.error('Failed to save SNS settings:', error)
      throw error
    }
  }

  return {
    snsLinks,
    selectedSNS,
    customUrls,
    loadSNSLinks,
    toggleSNS,
    updateCustomUrl,
    saveSNSSettings
  }
}
