import { Loader2 } from 'lucide-react';

const variants = {
  primary:
    'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500',
  secondary:
    'bg-gradient-to-r from-slate-700 to-slate-600 hover:from-slate-600 hover:to-slate-500',
  danger:
    'bg-gradient-to-r from-red-600 to-pink-600 hover:from-red-500 hover:to-pink-500',
  orange:
    'bg-gradient-to-r from-orange-600 to-pink-600 hover:from-orange-500 hover:to-pink-500',
  green:
    'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500',
  indigo:
    'bg-indigo-600 hover:bg-indigo-500',
  blue:
    'bg-blue-600 hover:bg-blue-700',
  purple:
    'bg-purple-600 hover:bg-purple-700',
};

const sizes = {
  sm: 'px-4 py-2 text-sm',
  md: 'py-2 px-6',
  lg: 'py-3 px-6',
};

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className = '',
  icon: Icon,
  ...props
}) {
  const base =
    'text-white font-semibold rounded-lg transition-all duration-200 shadow-lg disabled:from-gray-600 disabled:to-gray-500 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2';

  const variantClass = variants[variant] || variants.primary;
  const sizeClass = sizes[size] || sizes.md;
  const iconOnly = !children;

  return (
    <button
      disabled={disabled || loading}
      className={`${base} ${variantClass} ${sizeClass} ${iconOnly ? 'p-3' : ''} ${className}`}
      {...props}
    >
      {loading ? (
        <Loader2 className="animate-spin" size={18} />
      ) : Icon ? (
        <Icon size={18} />
      ) : null}
      {children}
    </button>
  );
}
