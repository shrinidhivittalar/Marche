import { Loader2, Sparkles } from 'lucide-react';

export function RephraseWithAiButton({
  show,
  loading,
  onClick,
}: {
  show: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  if (!show) return null;

  return (
    <button
      type="button"
      title="Rephrase with AI"
      aria-label="Rephrase with AI"
      aria-busy={loading}
      disabled={loading}
      onClick={onClick}
      className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-md border border-primary/20 bg-primary-subtle text-primary shadow-sm transition-colors hover:bg-primary hover:text-primary-fg focus-visible:shadow-focus disabled:pointer-events-none disabled:opacity-60 cursor-pointer"
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Sparkles className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
