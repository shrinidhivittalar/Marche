import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';

interface ComingSoonPageProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
}

export function ComingSoonPage({
  title = 'Coming Soon',
  description = "We're building this feature. Check back soon.",
  icon,
}: ComingSoonPageProps) {
  return (
    <div className="max-w-4xl mx-auto mt-12">
      <EmptyState title={title} description={description} icon={icon} />
    </div>
  );
}
