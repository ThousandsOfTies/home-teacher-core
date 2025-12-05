import * as SimpleIcons from 'simple-icons'

// 主要なSNSの定義
export type PredefinedSNS = {
  id: string
  name: string
  defaultUrl: string
  icon: string
}

export const PREDEFINED_SNS: PredefinedSNS[] = [
  { id: 'youtube', name: 'YouTube', defaultUrl: 'https://www.youtube.com/', icon: '📺' },
  { id: 'x', name: 'X (Twitter)', defaultUrl: 'https://x.com/', icon: '❌' },
  { id: 'instagram', name: 'Instagram', defaultUrl: 'https://www.instagram.com/', icon: '📷' },
  { id: 'tiktok', name: 'TikTok', defaultUrl: 'https://www.tiktok.com/', icon: '🎵' },
  { id: 'facebook', name: 'Facebook', defaultUrl: 'https://www.facebook.com/', icon: '👥' },
  { id: 'line', name: 'LINE', defaultUrl: 'https://line.me/', icon: '💬' },
  { id: 'discord', name: 'Discord', defaultUrl: 'https://discord.com/', icon: '🎮' },
  { id: 'twitch', name: 'Twitch', defaultUrl: 'https://www.twitch.tv/', icon: '🎬' },
  { id: 'reddit', name: 'Reddit', defaultUrl: 'https://www.reddit.com/', icon: '🤖' },
  { id: 'github', name: 'GitHub', defaultUrl: 'https://github.com/', icon: '💻' },
  { id: 'note', name: 'note', defaultUrl: 'https://note.com/', icon: '📝' },
  { id: 'zenn', name: 'Zenn', defaultUrl: 'https://zenn.dev/', icon: '⚡' },
  { id: 'qiita', name: 'Qiita', defaultUrl: 'https://qiita.com/', icon: '📚' },
  { id: 'niconico', name: 'ニコニコ動画', defaultUrl: 'https://www.nicovideo.jp/', icon: '📹' },
  { id: 'pixiv', name: 'pixiv', defaultUrl: 'https://www.pixiv.net/', icon: '🎨' },
  { id: 'amazon', name: 'Amazon', defaultUrl: 'https://www.amazon.co.jp/', icon: '📦' },
]

// SNS IDからSimple Iconsのアイコンを取得
export const getSNSIcon = (snsId: string): { svg: string; color: string } | null => {
  const iconMap: Record<string, string> = {
    'youtube': 'siYoutube',
    'x': 'siX',
    'instagram': 'siInstagram',
    'tiktok': 'siTiktok',
    'facebook': 'siFacebook',
    'line': 'siLine',
    'discord': 'siDiscord',
    'twitch': 'siTwitch',
    'reddit': 'siReddit',
    'github': 'siGithub',
    'note': 'siNote',
    'zenn': 'siZenn',
    'qiita': 'siQiita',
    'niconico': 'siNiconico',
    'pixiv': 'siPixiv',
    'amazon': 'siAmazon',
  }

  const iconKey = iconMap[snsId]
  if (iconKey && iconKey in SimpleIcons) {
    const icon = SimpleIcons[iconKey as keyof typeof SimpleIcons] as SimpleIcons.SimpleIcon
    return {
      svg: icon.svg,
      color: `#${icon.hex}`
    }
  }

  return null
}
