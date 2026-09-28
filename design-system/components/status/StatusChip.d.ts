import * as React from 'react';
export interface StatusChipProps { status: 'needs' | 'trusted' | 'accepted' | 'withdrawn' | 'rejected'; label?: string }
export declare function StatusChip(props: StatusChipProps): JSX.Element;
