import * as React from 'react';
export interface StatBlockProps { items: { label: string; value: string | number }[]; tone?: 'light' | 'dark'; direction?: 'row' | 'stack' }
export declare function StatBlock(props: StatBlockProps): JSX.Element;
