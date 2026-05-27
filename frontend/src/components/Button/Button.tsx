import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
}

export function Button({ variant = 'primary', children, className, ...props }: ButtonProps) {
  return (
    <button
      className={`${styles.btn} ${styles[variant]} ${className ?? ''}`}
      {...props}
    >
      {children}
    </button>
  );
}
