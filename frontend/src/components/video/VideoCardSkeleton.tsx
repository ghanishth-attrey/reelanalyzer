"use client";

export default function VideoCardSkeleton() {
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-lg overflow-hidden animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--border)]">
        <div className="h-3 w-16 bg-[var(--border)] rounded" />
        <div className="h-4 w-14 bg-[var(--border)] rounded" />
      </div>
      {/* Thumbnail */}
      <div className="aspect-video bg-[var(--border)]" />
      {/* Content */}
      <div className="p-3 space-y-3">
        <div className="h-4 bg-[var(--border)] rounded w-4/5" />
        <div className="h-3 bg-[var(--border)] rounded w-3/5" />
        <div className="h-10 bg-[var(--border)] rounded" />
        <div className="grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-10 bg-[var(--border)] rounded" />
          ))}
        </div>
        <div className="h-3 bg-[var(--border)] rounded w-2/5" />
      </div>
    </div>
  );
}
