import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import { clsx } from 'clsx';

// shadcn/ui's composable button pattern, styled by the workspace design tokens.
const variants = cva('ui-button', { variants: { variant: { default: 'ui-button-primary', outline: 'ui-button-outline', ghost: 'ui-button-ghost' }, size: { default: '', icon: 'ui-button-icon' } }, defaultVariants: { variant: 'default', size: 'default' } });
export function Button({ asChild, variant, size, className, ...props }) {
  const Component = asChild ? Slot : 'button';
  return <Component className={clsx(variants({ variant, size }), className)} {...props} />;
}
