import React, { useState } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  User,
  Paperclip,
  Check,
  CheckCheck,
  Circle,
  Briefcase,
  Shield,
  Clock,
  MoreVertical,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button, Card, Input } from '@marche/ui';

interface ConversationView {
  id: string; // contract id
  contactName: string;
  contactAvatar: string;
  category: string;
  jobTitle: string;
}

function formatMessageTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const MessagesPage: React.FC = () => {
  const { currentUser, contracts, messages, sendMessage, markMessagesRead, navigate } = useApp();

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const myContracts = contracts.filter(
    (c) => c.clientId === currentUser.id || c.vendorId === currentUser.id
  );

  const conversations: ConversationView[] = myContracts.map((ctr) => {
    const isClientView = currentUser.id === ctr.clientId;
    return {
      id: ctr.id,
      contactName: isClientView ? ctr.vendorName : ctr.clientName,
      contactAvatar: isClientView ? ctr.vendorAvatar : ctr.clientAvatar,
      category: ctr.category,
      jobTitle: ctr.jobTitle,
    };
  });

  const activeConv = conversations.find((c) => c.id === activeConvId) || conversations[0];

  const getContractMessages = (contractId: string) =>
    messages
      .filter((m) => m.contractId === contractId)
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  const activeMessages = activeConv ? getContractMessages(activeConv.id) : [];

  const isUnread = (convId: string) => {
    if (convId === activeConv?.id) return false; // the currently open conversation is always viewed
    return messages.some((m) => m.contractId === convId && m.senderId !== currentUser.id && !m.read);
  };

  const toggleFavorite = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(convId)) {
        next.delete(convId);
      } else {
        next.add(convId);
      }
      return next;
    });
  };

  const openConversation = (convId: string) => {
    setActiveConvId(convId);
    markMessagesRead(convId);
  };

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !activeConv) return;

    sendMessage(activeConv.id, inputText.trim());
    setInputText('');
  };

  const filteredConversations = conversations
    .filter(
      (c) =>
        c.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.jobTitle.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter((c) => !showUnreadOnly || isUnread(c.id))
    .filter((c) => !showFavoritesOnly || favoriteIds.has(c.id));

  return (
    <div className="max-w-6xl mx-auto h-full flex flex-col">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between pb-4 mb-6 border-b border-border">
        <div>
          <h1 className="text-2xl font-extrabold text-ink tracking-tight">
            Messages & Provider Chat
          </h1>
          <p className="text-xs text-ink-muted mt-1">
            Communicate with service providers, discuss proposal scope, and track milestone details.
          </p>
        </div>
      </div>

      {conversations.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-bg border border-border rounded-3xl py-16 px-8 flex flex-col items-center text-center gap-4 max-w-lg">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <MessageSquare className="w-9 h-9" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-extrabold text-ink tracking-tight">Welcome to Messages</h2>
              <p className="text-sm text-ink-muted max-w-sm">
                Once you connect with a client, you'll be able to chat and collaborate here.
              </p>
            </div>
            <Button
              onClick={() =>
                navigate(currentUser.role === 'vendor' ? '/provider/search' : '/client/jobs')
              }
            >
              {currentUser.role === 'vendor' ? 'Search Jobs' : 'View Your Jobs'}
            </Button>
          </div>
        </div>
      ) : (
      /* Main Messages Interface Grid */
      <div className="flex-1 min-h-0 bg-white border border-border rounded-3xl shadow-sm grid grid-cols-1 md:grid-cols-12 overflow-hidden">
        {/* Left Conversations Sidebar */}
        <div className="md:col-span-5 lg:col-span-4 border-r border-border flex flex-col bg-bg/50">
          <div className="p-3.5 border-b border-border space-y-2.5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">Messages</h2>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setSearchOpen((prev) => !prev)}
                  title="Search"
                  className={`p-1.5 rounded-lg cursor-pointer transition-colors ${
                    searchOpen ? 'bg-primary/10 text-primary' : 'text-ink-muted hover:text-ink hover:bg-white'
                  }`}
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  title="More options"
                  className="p-1.5 rounded-lg text-ink-muted hover:text-ink hover:bg-white cursor-pointer"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>

            {searchOpen && (
              <Input
                type="text"
                placeholder="Search messages or providers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full bg-white border border-border rounded-xl px-3 py-1.5 text-xs text-ink placeholder-zinc-400 focus:outline-none focus:border-primary"
              />
            )}

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                title="Filter"
                className="p-1.5 rounded-lg border border-border text-ink-muted hover:text-ink hover:bg-white cursor-pointer shrink-0"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setShowUnreadOnly((prev) => !prev)}
                className={`px-3 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors ${
                  showUnreadOnly
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'border-border text-ink-muted hover:text-ink'
                }`}
              >
                Unread
              </button>
              <button
                type="button"
                onClick={() => setShowFavoritesOnly((prev) => !prev)}
                className={`px-3 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors ${
                  showFavoritesOnly
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'border-border text-ink-muted hover:text-ink'
                }`}
              >
                Favorites
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-border">
            {filteredConversations.length === 0 && (
              <p className="p-6 text-center text-xs text-ink-muted">
                {showUnreadOnly
                  ? 'No unread conversations.'
                  : showFavoritesOnly
                  ? 'No favorite conversations yet.'
                  : 'No conversations match your search.'}
              </p>
            )}
            {filteredConversations.map((conv) => {
              const isActive = conv.id === activeConvId || (!activeConvId && conv.id === activeConv?.id);
              const convMessages = getContractMessages(conv.id);
              const lastMsg = convMessages[convMessages.length - 1];
              const unread = isUnread(conv.id);
              const isFavorite = favoriteIds.has(conv.id);
              return (
                <div
                  key={conv.id}
                  onClick={() => openConversation(conv.id)}
                  className={`p-3.5 flex items-start gap-3 cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-white border-l-4 border-l-primary shadow-xs'
                      : 'hover:bg-white/70'
                  }`}
                >
                  <div className="relative shrink-0">
                    <img
                      src={conv.contactAvatar}
                      alt={conv.contactName}
                      className="w-10 h-10 rounded-full object-cover ring-1 ring-border"
                    />
                    {unread && (
                      <span className="w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-white absolute -top-0.5 -right-0.5" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className={`text-xs truncate ${unread ? 'font-extrabold text-ink' : 'font-bold text-ink'}`}>
                        {conv.contactName}
                      </h4>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {lastMsg && (
                          <span className="text-[10px] font-mono text-ink-muted">
                            {formatMessageTime(lastMsg.timestamp)}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => toggleFavorite(conv.id, e)}
                          title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                          className="text-zinc-400 hover:text-amber-500 cursor-pointer"
                        >
                          <Star
                            className="w-3.5 h-3.5"
                            fill={isFavorite ? 'currentColor' : 'none'}
                            color={isFavorite ? '#f59e0b' : undefined}
                          />
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-ink-muted truncate leading-tight">
                      {lastMsg ? lastMsg.text : 'No messages yet'}
                    </p>

                    <div className="flex items-center gap-1 text-[10px] font-medium text-primary pt-0.5">
                      <Briefcase className="w-3 h-3 shrink-0" />
                      <span className="truncate">{conv.jobTitle}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Active Chat Window */}
        <div className="md:col-span-7 lg:col-span-8 flex flex-col bg-white">
          {/* Active Chat Header */}
          {activeConv && (
            <div className="p-4 border-b border-border flex items-center justify-between bg-white">
              <div className="flex items-center gap-3">
                <img
                  src={activeConv.contactAvatar}
                  alt={activeConv.contactName}
                  className="w-10 h-10 rounded-full object-cover ring-1 ring-border"
                />

                <div>
                  <h3 className="text-sm font-bold text-ink">
                    {activeConv.contactName}
                  </h3>
                  <p className="text-[11px] text-ink-muted font-medium">
                    {activeConv.category}
                  </p>
                </div>
              </div>

              <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-emerald-200">
                <Shield className="w-3.5 h-3.5" />
                <span className="truncate max-w-[200px]">
                  {activeConv.jobTitle}
                </span>
              </div>
            </div>
          )}

          {/* Messages Log Thread */}
          <div className="flex-1 p-4 md:p-6 overflow-y-auto space-y-4 bg-bg/30">
            {activeMessages.length === 0 && (
              <p className="text-center text-xs text-ink-muted pt-8">
                No messages yet. Say hello to {activeConv?.contactName.split(' ')[0]}.
              </p>
            )}
            {activeMessages.map((msg) => {
              const isMe = msg.senderId === currentUser.id;
              return (
                <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 mb-1 text-[10px] text-ink-muted font-mono">
                    <span>{msg.senderName}</span>
                    <span>•</span>
                    <span>{formatMessageTime(msg.timestamp)}</span>
                    {isMe &&
                      (msg.read ? (
                        <CheckCheck className="w-3 h-3 text-sky-500" />
                      ) : (
                        <Check className="w-3 h-3 text-zinc-400" />
                      ))}
                  </div>

                  <div
                    className={`max-w-md px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                      isMe
                        ? 'bg-primary text-white rounded-br-xs'
                        : 'bg-white text-ink border border-border rounded-bl-xs'
                    }`}
                  >
                    {msg.text}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chat Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="p-3.5 border-t border-border bg-white flex items-center gap-2"
          >
            <Input
              type="text"
              placeholder={`Message ${activeConv?.contactName.split(' ')[0]}...`}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              className="flex-1 bg-bg border border-border rounded-2xl px-4 py-2 text-xs text-ink placeholder-zinc-400 focus:outline-none focus:border-primary"
            />

            <Button
              type="submit"
              size="sm"
              icon={Send}
              disabled={!inputText.trim()}
              className="rounded-2xl"
            >
              Send
            </Button>
          </form>
        </div>
      </div>
      )}
    </div>
  );
};
