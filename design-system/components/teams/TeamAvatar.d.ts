import * as React from 'react';
export interface TeamAvatarProps { name: string; logoKey?: 'initials'|'shield'|'bug'|'lock'|'spark'|'code'|'leaf'; imageSrc?: string | null; size?: 'list'|'leaderboard'|'header' }
export declare function TeamAvatar(props: TeamAvatarProps): JSX.Element | null;
