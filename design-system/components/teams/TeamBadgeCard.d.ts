import * as React from 'react';
export interface TeamBadgeCardProps { kind: 'membership'|'contributor'; earned: boolean; threshold: number; earnedThreshold?: number; progress?: number }
export declare function TeamBadgeCard(props: TeamBadgeCardProps): JSX.Element | null;
