import * as React from 'react';
export interface ResponseBadgeCardProps { name: 'First Responder' | 'Fast Responder' | 'Coverage Contributor'; kind: 'Achievement' | 'Activity badge'; earned: boolean; description: string; criteria: { label: string; value: number; target: number; unit?: string }[]; clockNote?: string }
export declare function ResponseBadgeCard(props: ResponseBadgeCardProps): JSX.Element;
