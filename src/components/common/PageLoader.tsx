interface PageLoaderProps {
  variant?: 'dark' | 'light';
}

export default function PageLoader({ variant = 'dark' }: PageLoaderProps) {
  const spinnerColor = variant === 'dark' ? 'border-accent-500' : 'border-accent-500';

  return (
    // BlackBird: bb-page-loader — первые 2 с не видна (blackbird.css, загрузка разделов)
    <div className="bb-page-loader min-h-viewport flex items-center justify-center">
      <div
        className={`h-10 w-10 border-[3px] ${spinnerColor} animate-spin rounded-full border-t-transparent`}
      />
    </div>
  );
}
