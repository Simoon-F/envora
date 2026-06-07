interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

function Switch({ checked, onCheckedChange, disabled, className = "" }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`
        relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full
        transition-colors duration-200 ease-in-out
        ${checked ? "bg-primary" : "bg-muted"}
        ${disabled ? "opacity-50 cursor-not-allowed" : ""}
        ${className}
      `.trim()}
    >
      <span
        className={`
          pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-background shadow
          transform transition-transform duration-200 ease-in-out
          ${checked ? "translate-x-[18px]" : "translate-x-[3px]"}
        `.trim()}
      />
    </button>
  );
}

export { Switch };
export type { SwitchProps };
