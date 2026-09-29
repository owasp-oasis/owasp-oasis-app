import type { TeamLogoKey } from './teamApi'

interface Props { logo: TeamLogoKey; size?: number; className?: string }

export default function TeamLogoIcon({ logo, size = 24, className }: Props) {
  if (logo === 'initials') return null
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    {logo === 'shield' && <path {...common} d="M12 3 19 6v5c0 4.6-2.8 8-7 10-4.2-2-7-5.4-7-10V6l7-3Z" />}
    {logo === 'bug' && <><path {...common} d="M9 8.5h6v6a3 3 0 0 1-6 0v-6Z" /><path {...common} d="M12 5v3.5M7 11H4m16 0h-3M7.5 7.5 5.5 5.5m11 2 2-2M8 17l-2 2m10-2 2 2" /></>}
    {logo === 'lock' && <><rect {...common} x="5" y="10" width="14" height="10" rx="2" /><path {...common} d="M8 10V7a4 4 0 0 1 8 0v3" /></>}
    {logo === 'spark' && <path {...common} d="m12 3 1.6 5.4L19 10l-5.4 1.6L12 17l-1.6-5.4L5 10l5.4-1.6L12 3Zm6 12 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z" />}
    {logo === 'code' && <><path {...common} d="m9 7-5 5 5 5M15 7l5 5-5 5M14 4l-4 16" /></>}
    {logo === 'leaf' && <><path {...common} d="M19 4C11 4 6 7.5 6 13c0 3.9 2.5 6 5.5 6C17 19 20 12 19 4Z" /><path {...common} d="M5 21c2-4 5-7 10-9" /></>}
  </svg>
}
