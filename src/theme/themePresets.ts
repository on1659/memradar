import { MoonStar, Palette, Sparkles, SunMedium } from 'lucide-react'

export const THEME_PRESETS = [
  {
    id: 'dark',
    label: '다크 모드',
    description: '기본 다크 테마',
    preview: 'linear-gradient(135deg, #10131a 0%, #1a2130 100%)',
    icon: MoonStar,
    colors: {
      bg: '#0f141c',
      card: '#171d28',
      hover: '#1f2836',
      border: '#2a3444',
      text: '#97a3b6',
      textBright: '#edf2fb',
    },
  },
  {
    id: 'night',
    label: '나이트',
    description: '더 깊은 블랙 톤',
    preview: 'linear-gradient(135deg, #04060a 0%, #10131a 100%)',
    icon: Sparkles,
    colors: {
      bg: '#04070d',
      card: '#0b1018',
      hover: '#141b27',
      border: '#1d2634',
      text: '#8794aa',
      textBright: '#e6edf8',
    },
  },
  {
    id: 'light',
    label: '라이트 모드',
    description: '선명한 화이트 톤',
    preview: 'linear-gradient(135deg, #f5f7fb 0%, #ffffff 100%)',
    icon: SunMedium,
    colors: {
      bg: '#f4f7fb',
      card: '#ffffff',
      hover: '#eef2f8',
      border: '#d7deea',
      text: '#5f6b7d',
      textBright: '#172131',
    },
  },
  {
    id: 'paper',
    label: '페이퍼',
    description: '부드러운 아이보리 톤',
    preview: 'linear-gradient(135deg, #f5efe3 0%, #fffaf2 100%)',
    icon: Palette,
    colors: {
      bg: '#f5efe3',
      card: '#fffaf2',
      hover: '#f1e8d9',
      border: '#dfd2bd',
      text: '#726756',
      textBright: '#2f281f',
    },
  },
] as const

export const ACCENT_PRESETS = [
  { id: 'indigo', label: '인디고', color: '#6366f1', dim: '#4f46e5' },
  { id: 'teal', label: '민트', color: '#14b8a6', dim: '#0d9488' },
  { id: 'rose', label: '로즈', color: '#f43f5e', dim: '#e11d48' },
  { id: 'amber', label: '앰버', color: '#f59e0b', dim: '#d97706' },
  { id: 'violet', label: '바이올렛', color: '#8b5cf6', dim: '#7c3aed' },
] as const

export const WRAPPED_THEME_PRESET = {
  id: 'wrapped',
  label: 'Code Report',
  description: '테마와 독립된 Code Report 전용 다크 스토리 팔레트',
  colors: {
    bg: '#06060e',
    card: '#11101d',
    hover: '#1b1730',
    border: 'rgba(255, 255, 255, 0.12)',
    text: '#b7b0c9',
    textBright: '#f3efff',
    accent: '#7b6cf6',
    accentDim: '#6254db',
  },
} as const

export type ThemePresetId = typeof THEME_PRESETS[number]['id']
export type AccentPresetId = typeof ACCENT_PRESETS[number]['id']
