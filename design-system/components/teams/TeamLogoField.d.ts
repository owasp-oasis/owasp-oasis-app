import * as React from 'react';
export interface TeamLogoFieldProps { source: 'builtin'|'custom'; onSourceChange: (s: 'builtin'|'custom') => void; logoKey: string; onLogoKeyChange: (k: string) => void; custom?: React.ReactNode; disabled?: boolean; name: string }
export declare function TeamLogoField(props: TeamLogoFieldProps): JSX.Element | null;
