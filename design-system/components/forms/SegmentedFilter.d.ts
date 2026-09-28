import * as React from 'react';
export interface SegmentedFilterProps { options: { id: string; label: string; count?: number }[]; value: string; onChange: (id: string) => void }
export declare function SegmentedFilter(props: SegmentedFilterProps): JSX.Element;
