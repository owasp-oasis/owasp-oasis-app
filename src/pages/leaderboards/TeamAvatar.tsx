import { useState } from 'react'
import TeamLogoIcon from './TeamLogoIcon'
import { teamInitials, type TeamLogoKey } from './teamApi'

interface Props {
  team: { name: string; logo_key?: TeamLogoKey; logo_image_data?: string | null }
  large?: boolean
  iconSize?: number
}

export default function TeamAvatar({ team, large = false, iconSize = 20 }: Props) {
  const [failedImage, setFailedImage] = useState<string | null>(null)
  const image = team.logo_image_data
  const logo = team.logo_key ?? 'initials'
  return <span className={'team-avatar' + (large ? ' team-avatar--large' : '')} aria-hidden="true">
    {image && image !== failedImage
      ? <img className="team-logo-image" src={image} alt="" onError={() => setFailedImage(image)} />
      : logo === 'initials' ? teamInitials(team.name) : <TeamLogoIcon logo={logo} size={large ? 30 : iconSize} />}
  </span>
}
