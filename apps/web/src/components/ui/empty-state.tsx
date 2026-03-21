interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-surface-3">
        <svg
          className="h-5 w-5 text-text-tertiary"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="8" cy="8" r="6.5" />
          <line x1="8" y1="5" x2="8" y2="8.5" />
          <circle cx="8" cy="11" r="0.5" fill="currentColor" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-text-primary">{title}</h3>
      <p className="mt-1 max-w-xs text-xs text-text-tertiary">{description}</p>
    </div>
  );
}
