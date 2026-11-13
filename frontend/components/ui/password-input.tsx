'use client';

import * as React from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { cn } from '@/lib/utils';
import { Input } from './input';

type PasswordInputProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  /** Render a bare <input> styled only by `className` (the sign-in pages), instead of the shared Input. */
  plain?: boolean;
  /** Extra classes for the show/hide button, e.g. its colour on a custom background. */
  toggleClassName?: string;
};

/** A password field with a show/hide button on the right. */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, plain, toggleClassName, disabled, ...props }, ref) => {
    const tc = useTranslations('common');
    const [visible, setVisible] = React.useState(false);
    const Field = plain ? 'input' : Input;

    return (
      <div className="relative w-full">
        <Field
          ref={ref}
          type={visible ? 'text' : 'password'}
          disabled={disabled}
          className={cn(className, 'pr-10')}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          // Keep the cursor in the field when the button is clicked.
          onMouseDown={(e) => e.preventDefault()}
          disabled={disabled}
          aria-label={visible ? tc('hidePassword') : tc('showPassword')}
          aria-pressed={visible}
          title={visible ? tc('hidePassword') : tc('showPassword')}
          className={cn(
            'absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50',
            toggleClassName,
          )}
        >
          {visible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';
