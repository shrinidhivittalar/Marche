import { Star } from "lucide-react";
import { cn } from "../lib/cn";

export interface RatingStarsProps {
  rating: number;
  reviewCount?: number;
  className?: string;
}

export function RatingStars({ rating, reviewCount, className }: RatingStarsProps) {
  const rounded = Math.round(rating * 2) / 2;

  return (
    <div className={cn("flex items-center gap-1.5", className)} role="img" aria-label={`Rated ${rating} out of 5`}>
      <div className="flex items-center" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => {
          const filled = i + 1 <= rounded;
          return (
            <Star
              key={i}
              size={15}
              fill={filled ? "currentColor" : "none"}
              className={filled ? "text-accent" : "text-border-strong"}
              strokeWidth={1.75}
            />
          );
        })}
      </div>
      <span className="text-sm font-semibold text-ink">{rating.toFixed(1)}</span>
      {reviewCount !== undefined ? (
        <span className="text-sm text-ink-muted">({reviewCount})</span>
      ) : null}
    </div>
  );
}
