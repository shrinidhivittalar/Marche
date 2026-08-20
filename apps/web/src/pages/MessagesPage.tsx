import React, { useEffect, useState } from 'react';
import {
  MessageSquare,
  Search,
  Send,
  Paperclip,
  Check,
  CheckCheck,
  Briefcase,
  Shield,
  Star,
  ArrowLeft,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { Button, Input, Skeleton } from '@marche/ui';
import { useApiResource } from '../hooks/useApiResource';
import { usePolling } from '../hooks/usePolling';
import { connectionsApi, type ApiConnection } from '../lib/proposals-api';
import { messagesApi, type ApiMessage } from '../lib/messages-api';

interface ConversationView {
  id: string; // connection id
  contactName: string;
  location: string | null;
  jobTitle: string;
}

// No signed avatar URL travels on a Connection (see proposals-api.ts's
// ApiConnection) — same situation PublicProfilePage is in for a profile with
// no picture, so this follows its pattern rather than inventing another one.
function AvatarPlaceholder({ name, className }: { name: string; className: string }) {
  return (
    <div
      className={`bg-surface-subtle border border-border flex items-center justify-center font-semibold text-ink-muted shrink-0 ${className}`}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function formatMessageTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDateDivider(timestamp: string): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

function conversationFromConnection(conn: ApiConnection, isClientView: boolean): ConversationView {
  return {
    id: conn.id,
    contactName: isClientView ? conn.providerProfile.displayName : conn.clientProfile.displayName,
    location: isClientView ? conn.providerProfile.location : conn.clientProfile.location,
    jobTitle: conn.job.title,
  };
}

type ConversationFilter = 'all' | 'unread' | 'favorites';

// No websocket or SSE infrastructure exists anywhere in this app yet (see
// FEATURE_GAP_ANALYSIS.md's messaging section) — polling on the screen that
// actually needs near-live delivery is the minimal way to get replies to
// show up without a page refresh, without adding a new pattern for one page.
const POLL_INTERVAL_MS = 4000;

export const MessagesPage: React.FC = () => {
  const {
    currentUser,
    accessToken,
    navigate,
    favoriteConversationIds,
    toggleFavoriteConversation,
  } = useApp();
  const token = accessToken as string;
  const isClientView = currentUser.role === 'client';

  const connections = useApiResource(() => connectionsApi.mine(token, 1, 100), [token], {
    enabled: Boolean(token),
  });
  const previews = useApiResource(() => messagesApi.previews(token), [token], {
    enabled: Boolean(token),
  });

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list');
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<ConversationFilter>('all');
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const conversations: ConversationView[] = (connections.data?.items ?? []).map((conn) =>
    conversationFromConnection(conn, isClientView),
  );

  const activeConv = conversations.find((c) => c.id === activeConvId) || conversations[0];

  const thread = useApiResource(
    () =>
      activeConv ? messagesApi.forConnection(token, activeConv.id, 1, 100) : Promise.resolve(null),
    [token, activeConv?.id],
    { enabled: Boolean(token && activeConv) },
  );

  // Newest first off the wire (see messages-api.ts) — reversed here into
  // thread order, same as the mock data this replaces was sorted client-side.
  const activeMessages: ApiMessage[] = thread.data ? [...thread.data.items].reverse() : [];

  // Poll the open thread and the conversation-list previews so a reply from
  // the other party shows up without a manual refresh.
  usePolling(thread.refetch, Boolean(activeConv), POLL_INTERVAL_MS);
  usePolling(previews.refetch, Boolean(token), POLL_INTERVAL_MS);

  const previewFor = (convId: string) => previews.data?.find((p) => p.connectionId === convId);

  const isUnread = (convId: string) => {
    if (convId === activeConv?.id) return false; // the currently open conversation is always viewed
    return (previewFor(convId)?.unreadCount ?? 0) > 0;
  };

  const toggleFavorite = (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    toggleFavoriteConversation(convId);
  };

  const openConversation = (convId: string) => {
    setActiveConvId(convId);
    setMobileView('chat');
    void messagesApi.markRead(token, convId).then(() => previews.refetch());
  };

  // `activeConv` falls back to conversations[0] below so the chat panel
  // isn't empty on first load — but that fallback only affects what's
  // rendered, not `activeConvId` (deliberately left unset; the fallback
  // already handles highlighting it as active). Without this, the first
  // conversation displays as open while staying genuinely unread
  // server-side, since markRead otherwise only runs from
  // openConversation's explicit click handler.
  useEffect(() => {
    const firstConvId = conversations[0]?.id;
    if (!activeConvId && firstConvId) {
      void messagesApi.markRead(token, firstConvId).then(() => previews.refetch());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConvId, conversations[0]?.id]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || !activeConv || sending) return;

    setSending(true);
    setInputText('');
    try {
      await messagesApi.send(token, activeConv.id, text);
      await thread.refetch();
      void previews.refetch();
    } catch {
      showToast("Couldn't send that message. Try again.");
      setInputText(text);
    } finally {
      setSending(false);
    }
  };

  const unreadCount = conversations.filter((c) => isUnread(c.id)).length;

  const filteredConversations = conversations
    .filter(
      (c) =>
        c.contactName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()),
    )
    .filter((c) => activeFilter !== 'unread' || isUnread(c.id))
    .filter((c) => activeFilter !== 'favorites' || favoriteConversationIds.includes(c.id));

  if (connections.loading) {
    return (
      <div className="space-y-3" data-testid="messages-loading">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="p-3.5 rounded-2xl border border-border bg-bg flex items-start gap-3"
          >
            <Skeleton className="w-10 h-10 rounded-full shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {toastMessage && (
        <div className="fixed bottom-20 right-6 md:bottom-6 z-50 bg-inverse text-inverse-fg px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-5 duration-200 text-xs font-medium">
          <span>{toastMessage}</span>
        </div>
      )}

      {conversations.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-bg border border-border rounded-3xl py-16 px-8 flex flex-col items-center text-center gap-4 max-w-lg">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
              <MessageSquare className="w-9 h-9" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-xl font-extrabold text-ink tracking-tight">
                Welcome to Messages
              </h2>
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
        <div className="flex-1 min-h-0 bg-surface border border-border rounded-3xl shadow-sm grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left Conversations Sidebar */}
          <div
            className={`${mobileView === 'chat' ? 'hidden' : 'flex'} md:flex md:col-span-5 lg:col-span-4 min-h-0 border-r border-border flex-col bg-bg/50`}
          >
            <div className="shrink-0 p-3.5 border-b border-border space-y-3">
              <h2 className="text-base font-bold text-ink">Messages</h2>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-ink-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <Input
                  type="text"
                  placeholder="Search messages or providers..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-surface border border-border rounded-xl pl-9 pr-3 py-1.5 text-xs text-ink placeholder-ink-muted focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center gap-1.5">
                {(['all', 'unread', 'favorites'] as ConversationFilter[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setActiveFilter(f)}
                    className={`px-3 py-1 rounded-full text-xs font-medium border cursor-pointer transition-colors flex items-center gap-1.5 ${
                      activeFilter === f
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'border-border text-ink-muted hover:text-ink'
                    }`}
                  >
                    {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : 'Favourites'}
                    {f === 'unread' && unreadCount > 0 && (
                      <span className="text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center bg-primary/10 text-primary">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-border">
              {filteredConversations.length === 0 && (
                <p className="p-6 text-center text-xs text-ink-muted">
                  {activeFilter === 'unread'
                    ? 'No unread conversations.'
                    : activeFilter === 'favorites'
                      ? 'No favorite conversations yet.'
                      : 'No conversations match your search.'}
                </p>
              )}
              {filteredConversations.map((conv) => {
                const isActive =
                  conv.id === activeConvId || (!activeConvId && conv.id === activeConv?.id);
                const lastMsg = previewFor(conv.id)?.lastMessage;
                const unread = isUnread(conv.id);
                const isFavorite = favoriteConversationIds.includes(conv.id);
                return (
                  <div
                    key={conv.id}
                    data-testid="conversation-row"
                    onClick={() => openConversation(conv.id)}
                    className={`p-3.5 flex items-start gap-3 cursor-pointer transition-colors ${
                      isActive
                        ? 'bg-surface border-l-4 border-l-primary shadow-xs'
                        : 'hover:bg-surface/70'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <AvatarPlaceholder
                        name={conv.contactName}
                        className="w-10 h-10 rounded-full"
                      />
                      {unread && (
                        <span className="w-2.5 h-2.5 rounded-full bg-primary ring-2 ring-surface absolute -top-0.5 -right-0.5" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <h4
                          className={`text-xs truncate ${unread ? 'font-extrabold text-ink' : 'font-bold text-ink'}`}
                        >
                          {conv.contactName}
                        </h4>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {lastMsg && (
                            <span className="text-[10px] font-mono text-ink-muted">
                              {formatMessageTime(lastMsg.createdAt)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={(e) => toggleFavorite(conv.id, e)}
                            title={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                            className="text-ink-muted hover:text-amber-500 cursor-pointer"
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
                        {lastMsg ? lastMsg.body : 'No messages yet'}
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
          <div
            className={`${mobileView === 'list' ? 'hidden' : 'flex'} md:flex md:col-span-7 lg:col-span-8 min-h-0 flex-col bg-surface`}
          >
            {/* Active Chat Header */}
            {activeConv && (
              <div className="shrink-0 p-4 border-b border-border flex items-center justify-between bg-surface">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileView('list')}
                    className="md:hidden p-1.5 -ml-1.5 rounded-lg text-ink-muted hover:text-ink cursor-pointer"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <AvatarPlaceholder
                    name={activeConv.contactName}
                    className="w-10 h-10 rounded-full"
                  />

                  <div>
                    <h3 className="text-sm font-bold text-ink">{activeConv.contactName}</h3>
                    {activeConv.location && (
                      <p className="text-[11px] text-ink-muted font-medium">
                        {activeConv.location}
                      </p>
                    )}
                  </div>
                </div>

                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold border border-emerald-200 dark:border-emerald-500/20">
                  <Shield className="w-3.5 h-3.5" />
                  <span className="truncate max-w-[200px]">{activeConv.jobTitle}</span>
                </div>
              </div>
            )}

            {/* Messages Log Thread */}
            <div className="flex-1 min-h-0 p-4 md:p-6 overflow-y-auto space-y-4 bg-bg/30">
              {activeMessages.length === 0 && (
                <p className="text-center text-xs text-ink-muted pt-8">
                  No messages yet. Say hello to {activeConv?.contactName.split(' ')[0]}.
                </p>
              )}
              {activeMessages.map((msg, idx) => {
                const isMe = msg.senderUserId === currentUser.id;
                const prevMsg = idx > 0 ? activeMessages[idx - 1] : undefined;
                const msgDate = new Date(msg.createdAt).toDateString();
                const prevDate = prevMsg ? new Date(prevMsg.createdAt).toDateString() : null;
                const showDivider = msgDate !== prevDate;
                return (
                  <React.Fragment key={msg.id}>
                    {showDivider && (
                      <div className="flex justify-center py-1">
                        <span className="px-3 py-1 rounded-full bg-surface border border-border text-[10px] font-semibold text-ink-muted shadow-xs">
                          {formatDateDivider(msg.createdAt)}
                        </span>
                      </div>
                    )}
                    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <div className="flex items-center gap-1.5 mb-1 text-[10px] text-ink-muted font-mono">
                        <span>{isMe ? currentUser.name : activeConv?.contactName}</span>
                        <span>•</span>
                        <span>{formatMessageTime(msg.createdAt)}</span>
                        {isMe &&
                          (msg.readAt ? (
                            <CheckCheck className="w-3 h-3 text-sky-500" />
                          ) : (
                            <Check className="w-3 h-3 text-ink-muted" />
                          ))}
                      </div>

                      <div
                        data-testid="message-bubble"
                        className={`max-w-md px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                          isMe
                            ? 'bg-primary text-primary-foreground rounded-br-xs'
                            : 'bg-surface text-ink border border-border rounded-bl-xs'
                        }`}
                      >
                        {msg.body}
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>

            {/* Chat Input Bar */}
            <form
              onSubmit={handleSendMessage}
              className="shrink-0 p-3.5 border-t border-border bg-surface flex items-center gap-2"
            >
              <button
                type="button"
                title="Attach file"
                onClick={() => showToast("File attachments aren't wired up yet.")}
                className="p-2 rounded-full text-ink-muted hover:text-ink hover:bg-bg cursor-pointer shrink-0"
              >
                <Paperclip className="w-4 h-4" />
              </button>

              <Input
                type="text"
                data-testid="message-input"
                placeholder={`Message ${activeConv?.contactName.split(' ')[0]}...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="flex-1 bg-bg border border-border rounded-2xl px-4 py-2 text-xs text-ink placeholder-ink-muted focus:outline-none focus:border-primary"
              />

              <Button
                type="submit"
                size="sm"
                icon={Send}
                disabled={!inputText.trim() || sending}
                className="rounded-2xl"
                data-testid="send-message"
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
