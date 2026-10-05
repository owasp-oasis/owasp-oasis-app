import * as React from 'react';
export interface DecisionChipProps { decision: 'accept' | 'modify' | 'reject' | 'duplicate'; label?: string }
export declare function DecisionChip(props: DecisionChipProps): JSX.Element;
