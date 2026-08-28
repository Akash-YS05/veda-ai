type IconPlaceholderProps = {
  label: string;
  className?: string;
};

/** Temporary slot for the icon system you will add later. */
export function IconPlaceholder({ label, className = "" }: IconPlaceholderProps) {
  return (
    <span aria-hidden="true" className={`icon-placeholder ${className}`} data-icon={label}>
      {label.slice(0, 1)}
    </span>
  );
}
