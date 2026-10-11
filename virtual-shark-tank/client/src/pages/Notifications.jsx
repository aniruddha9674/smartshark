import { Link } from "react-router-dom";
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from "../hooks/useNotifications";
import { getErrorMessage } from "../lib/api";

export default function Notifications() {
  const { data: items, isLoading, error } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  if (isLoading) return <div className="text-zinc-500">Loading...</div>;
  if (error) {
    return (
      <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
        {getErrorMessage(error)}
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-16 text-zinc-500">No notifications yet.</div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <button
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending}
          className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 border border-zinc-800 rounded-lg"
        >
          Mark all read
        </button>
      </div>

      <div className="space-y-2">
        {items.map((n) => (
          <div
            key={n.id}
            onClick={() => !n.isRead && markRead.mutate(n.id)}
            className={`p-4 rounded-xl border cursor-pointer transition-colors ${
              n.isRead
                ? "bg-zinc-900 border-zinc-800"
                : "bg-zinc-900 border-brand/40 hover:border-brand"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${
                  n.isRead ? "bg-zinc-700" : "bg-brand"
                }`}
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-zinc-100">{n.title}</div>
                {n.body && <div className="text-sm text-zinc-500 mt-1">{n.body}</div>}
                <div className="text-xs text-zinc-600 mt-2">
                  {new Date(n.createdAt).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}