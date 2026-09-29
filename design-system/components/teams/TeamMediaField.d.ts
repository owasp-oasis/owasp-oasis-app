import * as React from 'react';
export interface TeamMediaFieldProps { kind: 'logo'|'banner'; preview?: string | null; note?: string; onChoose: (file: File) => void; onRemove?: () => void; error?: string; disabled?: boolean }
export declare function TeamMediaField(props: TeamMediaFieldProps): JSX.Element | null;
