import * as React from 'react';
export interface ButtonProps {
  /** primary = green CTA (one per view); secondary = blue; outline = blue ring; ghost-light = white ring on gradient; quiet = white w/ line border */
  variant?: 'primary' | 'secondary' | 'outline' | 'quiet' | 'ghost-light';
  size?: 'md' | 'lg';
  iconRight?: React.ReactNode;
  disabled?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}
export declare function Button(props: ButtonProps): JSX.Element;
