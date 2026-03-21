interface TopbarProps {
  title: string;
  subtitle?: string;
}

export function Topbar({ title, subtitle }: TopbarProps) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-border-subtle bg-surface-1/60 pl-14 pr-6 lg:px-6 backdrop-blur-sm">
      <div>
        <h1 className="text-sm font-semibold text-text-primary">{title}</h1>
        {subtitle && (
          <p className="text-2xs text-text-tertiary">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1.5 text-2xs text-text-tertiary">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent-green" />
          API Connected
        </span>
      </div>
    </header>
  );
}
