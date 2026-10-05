import * as React from 'react';
export interface WorkspaceSidebarProps { active: 'queue' | 'fixes' | 'projects' | 'validators' | 'maintainers'; counts?: Partial<Record<string, number>>; onNavigate?: (id: string) => void }
export declare function WorkspaceSidebar(props: WorkspaceSidebarProps): JSX.Element;
