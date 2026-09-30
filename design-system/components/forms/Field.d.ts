import * as React from 'react';
export interface FieldProps { label: string; required?: boolean; hint?: string; error?: string; multiline?: boolean; value: string; onChange: (v: string) => void; placeholder?: string }
export declare function Field(props: FieldProps): JSX.Element;
