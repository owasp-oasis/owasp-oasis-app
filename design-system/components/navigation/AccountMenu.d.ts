import * as React from 'react';
export interface AccountMenuProps { login: string; role?: string; rank?: string; reputation?: string; onPreferences?: () => void; onSyncStatus?: () => void; onSignOut?: () => void }
export declare function AccountMenu(props: AccountMenuProps): JSX.Element;
