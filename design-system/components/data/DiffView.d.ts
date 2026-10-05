import * as React from 'react';
export interface DiffViewProps { file: string; lines: [' ' | '+' | '-', string][]; mode?: 'unified' | 'split' }
export declare function DiffView(props: DiffViewProps): JSX.Element;
