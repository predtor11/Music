import { motion, type HTMLMotionProps } from 'motion/react';
import { forwardRef, type ReactNode } from 'react';
import { spring } from '../motion.js';

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading = false, icon, children, className, disabled, type = 'button', ...rest },
  ref,
) {
  const off = disabled || loading;
  return (
    <motion.button
      ref={ref}
      type={type}
      className={['ui-button', className].filter(Boolean).join(' ')}
      data-variant={variant}
      data-size={size}
      disabled={off}
      aria-busy={loading || undefined}
      whileHover={off ? undefined : { y: -1 }}
      whileTap={off ? undefined : { scale: 0.97, y: 0 }}
      transition={spring.snappy}
      {...rest}
    >
      {loading ? <span className="ui-spinner" aria-hidden /> : icon}
      {children}
    </motion.button>
  );
});
