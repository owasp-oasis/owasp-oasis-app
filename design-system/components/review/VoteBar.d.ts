import * as React from 'react';
export interface VoteBarProps { value?: 'accept' | 'modify' | 'reject' | 'duplicate' | null; onChange: (d: string | null) => void; disabled?: boolean }
export declare function VoteBar(props: VoteBarProps): JSX.Element;
