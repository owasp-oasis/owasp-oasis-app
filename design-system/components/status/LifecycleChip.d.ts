import * as React from 'react';
export interface LifecycleChipProps { stage: 'needs-review' | 'trusted' | 'maintainer-review' | 'changes-requested' | 'maintainer-accepted' | 'maintainer-declined' | 'submitted-upstream' | 'merged-upstream' | 'closed-without-merge'; label?: string }
export declare function LifecycleChip(props: LifecycleChipProps): JSX.Element;
