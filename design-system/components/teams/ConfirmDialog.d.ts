import * as React from 'react';
export interface ConfirmDialogProps { open: boolean; title: string; explanation: string; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onCancel: () => void }
export declare function ConfirmDialog(props: ConfirmDialogProps): JSX.Element | null;
