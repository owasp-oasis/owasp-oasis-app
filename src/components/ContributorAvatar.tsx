import { useEffect, useState } from 'react';
import './ContributorAvatar.css';

interface ContributorAvatarProps {
  login: string;
  src?: string | null;
  size?: number;
  className?: string;
}

function initialsFor(login: string): string {
  const parts = login.split(/[._-]+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return login.slice(0, 2).toUpperCase();
}

export default function ContributorAvatar({
  login,
  src,
  size = 32,
  className = '',
}: ContributorAvatarProps) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = src ?? `https://github.com/${login}.png?size=${size * 2}`;

  useEffect(() => setFailed(false), [avatarUrl]);

  if (failed) {
    return (
      <span
        className={`contributor-avatar-fallback ${className}`.trim()}
        style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.34)) }}
        aria-hidden="true"
      >
        {initialsFor(login)}
      </span>
    );
  }

  return (
    <img
      src={avatarUrl}
      alt=""
      className={className}
      width={size}
      height={size}
      onError={() => setFailed(true)}
    />
  );
}
