import { useState } from "react";
import { useConversations } from "../hooks/useConversations";
import { useMessages, useSendMessage, useMarkRead } from "../hooks/useMessages";
import { getErrorMessage } from "../lib/api";

export default function Messages() {
  const [activeId, setActiveId] = useState(null);
  const { data: conversations, isLoading, error } = useConversations();

  if (isLoading) return <div className="text-zinc-500">Loading...</div>;
  if (error) {
    return (
      <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
        {getErrorMessage(error)}
      </div>
    );
  }

  if (!conversations || conversations.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500">
        No conversations yet. Messages open when an offer is accepted.
      </div>
    );
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-10rem)]">
      <div className="w-72 flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl overflow-y-auto">
        {conversations.map((c) => (
          <button
            key={c.id}
            onClick={() => setActiveId(c.id)}
            className={`text-left px-4 py-3 border-b border-zinc-800 last:border-0 hover:bg-zinc-800 ${
              activeId === c.id ? "bg-zinc-800" : ""
            }`}
          >
            <div className="text-sm font-medium text-zinc-100 truncate">
              {c.otherUser?.name || "Conversation"}
            </div>
            <div className="text-xs text-zinc-500 truncate mt-0.5">
              {c.lastMessagePreview || "No messages yet"}
            </div>
          </button>
        ))}
      </div>

      <div className="flex-1 flex flex-col bg-zinc-900 border border-zinc-800 rounded-xl">
        {activeId ? (
          <ChatPane conversationId={activeId} />
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-500 text-sm">
            Select a conversation
          </div>
        )}
      </div>
    </div>
  );
}

function ChatPane({ conversationId }) {
  const [body, setBody] = useState("");
  const { data: messages, isLoading } = useMessages(conversationId);
  const send = useSendMessage(conversationId);
  const markRead = useMarkRead(conversationId);
  const me = JSON.parse(localStorage.getItem("user") || "{}");

  const submit = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    await send.mutateAsync(body);
    setBody("");
    markRead.mutate();
  };

  return (
    <>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading && <div className="text-zinc-500 text-sm">Loading messages...</div>}
        {messages?.map((m) => {
          const isMine = m.senderId === me.id;
          return (
            <div
              key={m.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                  isMine
                    ? "bg-brand text-white"
                    : "bg-zinc-800 text-zinc-100"
                }`}
              >
                {m.body}
              </div>
            </div>
          );
        })}
      </div>

      <form onSubmit={submit} className="flex gap-2 p-3 border-t border-zinc-800">
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={send.isPending || !body.trim()}
          className="px-4 py-2 bg-brand hover:bg-brand-hover rounded-lg text-sm font-medium disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </>
  );
}