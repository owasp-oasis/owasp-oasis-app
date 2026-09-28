import * as React from 'react';
export interface CheckboxProps { checked: boolean; onChange: (v: boolean) => void; label: string; meta?: string }
export declare function Checkbox(props: CheckboxProps): JSX.Element;
