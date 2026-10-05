import * as React from 'react';
export interface ConsensusBarProps { accept: number; modify: number; reject: number; duplicate?: number; showLegend?: boolean }
export declare function ConsensusBar(props: ConsensusBarProps): JSX.Element;
