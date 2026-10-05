import * as React from 'react';
export interface SiteNavProps { active?: string; user?: { login: string } | null; onAccount?: () => void }
export declare function SiteNav(props: SiteNavProps): JSX.Element;
