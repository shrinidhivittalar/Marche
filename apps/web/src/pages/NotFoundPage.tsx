import { Compass } from 'lucide-react';
import { EmptyState } from '../components/common/EmptyState';
import { useApp } from '../context/AppContext';

export function NotFoundPage() {
  const { navigate } = useApp();

  return (
    <div className="max-w-4xl mx-auto mt-12">
      <EmptyState
        title="Page not found"
        description="That link doesn't lead anywhere — the page may have moved or never existed."
        icon={Compass}
        actionLabel="Go home"
        onAction={() => navigate('/')}
      />
    </div>
  );
}
