import React from 'react';
import { Search } from 'lucide-react';
import { useApp } from '../../context/AppContext';

// Replaces the sidebar's "Search" nav item. A plain button rather than a
// typeable field — an input here would look like it does something on
// every keystroke (autocomplete, live results), when all it can actually
// do is hand off a query on submit. A button makes the real behaviour
// (navigate to the marketplace) the only thing it implies.
export const TopSearchBar: React.FC = () => {
  const { navigate } = useApp();

  return (
    <button
      type="button"
      onClick={() => navigate('/client/search')}
      className="hidden md:flex items-center gap-2 bg-search-pill hover:bg-[#16213a] text-white rounded-full px-5 py-2.5 shadow-md transition-colors cursor-pointer text-sm font-semibold"
    >
      <Search className="w-4 h-4 text-zinc-400 shrink-0" />
      Search Marketplace
    </button>
  );
};
