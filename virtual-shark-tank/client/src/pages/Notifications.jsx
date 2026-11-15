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

  if (isLoading) return <div className="text-slate-500">Loading...</div>;
  if (error) {
    return (
      <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 text-red-600 rounded-lg">
        {getErrorMessage(error)}
      </div>
    );
  }
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-16 text-slate-500">No notifications yet.</div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        <button
          onClick={() => markAllRead.mutate()}
          disabled={markAllRead.isPending}
          className="btn-secondary btn-sm"
        >
          Mark all read
        </button>
      </div>

      <div className="joined-grid">
        {items.map((n) => (
          <div
            key={n.id}
            onClick={() => !n.isRead && markRead.mutate(n.id)}
            className={`joined-cell p-4 cursor-pointer transition-colors ${
              n.isRead
                ? "hover:bg-slate-50"
                : "border-l-[3px] border-indigo-400 bg-indigo-50"
            }`}
          >
            <div className="flex items-start gap-3">
              <span
                className={`w-2 h-2 mt-2 rounded-full flex-shrink-0 ${
                  n.isRead ? "bg-slate-200" : "bg-indigo-500"
                }`}
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-900">{n.title}</div>
                {n.body && <div className="text-sm text-slate-500 mt-1">{n.body}</div>}
                <div className="text-xs text-slate-400 mt-2">
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