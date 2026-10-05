import * as React from 'react';
export interface InlineSearchResultsProps { label: string; placeholder: string; query: string; onQuery: (q: string) => void; status: string; results: { id: string; title: string; description?: string }[]; actionLabel: string; onAction: (id: string) => void; fallback?: React.ReactNode }
export declare function InlineSearchResults(props: InlineSearchResultsProps): JSX.Element | null;
