import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useAuth } from "../stores/auth";
import Feed from "./investor/Feed";
import Shortlist from "./investor/Shortlist";
import MyOffers from "./investor/MyOffers";
import Portfolio from "./investor/Portfolio";
import Messages from "./Messages";
import Notifications from "./Notifications";
import MyBusinesses from "./business/MyBusinesses";
import BusinessDetail from "./business/BusinessDetail";
import Matches from "./business/Matches";
import OffersReceived from "./business/OffersReceived";

export default function Dashboard() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);

  const caps = user?.capabilities || {};
  const isInvestor = !!caps.isInvestor;
  const hasBusiness = !!caps.hasBusiness;
  const isAdmin = !!caps.isAdmin;
  const needsOnboarding = !isInvestor && !hasBusiness && !isAdmin;

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-zinc-900 border-r border-zinc-800 p-4 flex flex-col gap-1">
        <div className="text-sm font-semibold mb-4 px-2">SmartShark</div>

        {isInvestor && (
          <>
            <SidebarLink to="/dashboard" end>Home</SidebarLink>
            <SidebarLink to="/dashboard/feed">Feed</SidebarLink>
            <SidebarLink to="/dashboard/shortlist">Shortlist</SidebarLink>
            <SidebarLink to="/dashboard/offers">My Offers</SidebarLink>
            <SidebarLink to="/dashboard/portfolio">Portfolio</SidebarLink>
            <SidebarLink to="/dashboard/messages">Messages</SidebarLink>
<SidebarLink to="/dashboard/notifications">Notifications</SidebarLink>
          </>
        )}

        {hasBusiness && (
          <>
            <SidebarLink to="/dashboard" end>Home</SidebarLink>
            <SidebarLink to="/dashboard/businesses">My Businesses</SidebarLink>
            <SidebarLink to="/dashboard/pitches">Pitches</SidebarLink>
            <SidebarLink to="/dashboard/matches">Matches</SidebarLink>
            <SidebarLink to="/dashboard/offers-received">Offers</SidebarLink>
            <SidebarLink to="/dashboard/messages">Messages</SidebarLink>
<SidebarLink to="/dashboard/notifications">Notifications</SidebarLink>
          </>
        )}

        {isAdmin && <SidebarLink to="/dashboard/review">Review Queue</SidebarLink>}

        {needsOnboarding && (
          <SidebarLink to="/onboarding">Get started</SidebarLink>
        )}

        <div className="mt-auto">
          <SidebarLink to="/dashboard/settings">Settings</SidebarLink>
        </div>
      </aside>

      <main className="flex-1 flex flex-col">
        <header className="flex items-center justify-between px-8 py-4 border-b border-zinc-800">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-zinc-300">{user?.name}</span>
            {isInvestor && (
              <span className="text-xs px-1.5 py-0.5 bg-brand/10 text-brand rounded">
                Investor
              </span>
            )}
            {hasBusiness && (
              <span className="text-xs px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 rounded">
                Business
              </span>
            )}
            {isAdmin && (
              <span className="text-xs px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded">
                Admin
              </span>
            )}
          </div>
          <button
            onClick={logout}
            className="px-3 py-1.5 text-sm text-zinc-400 hover:text-zinc-100 border border-zinc-800 rounded-lg hover:border-zinc-700"
          >
            Log out
          </button>
        </header>

        <div className="flex-1 p-8 overflow-auto">
          <Routes>
            <Route path="/" element={<DashboardHome user={user} caps={caps} />} />

            <Route
              path="/feed"
              element={isInvestor ? <Feed /> : <Navigate to="/dashboard" replace />}
            />
            <Route
              path="/match/:matchId"
              element={
                isInvestor ? <BusinessDetail /> : <Navigate to="/dashboard" replace />
              }
            />
            <Route
              path="/shortlist"
              element={
                isInvestor ? <Shortlist /> : <Navigate to="/dashboard" replace />
              }
            />
            <Route
              path="/offers"
              element={
                isInvestor ? <MyOffers /> : <Navigate to="/dashboard" replace />
              }
            />
            <Route
              path="/portfolio"
              element={
                isInvestor ? <Portfolio /> : <Navigate to="/dashboard" replace />
              }
            />

            <Route
              path="*"
              element={<div className="text-zinc-500">Coming soon.</div>}
            />
            <Route path="/messages" element={<Messages />} />
<Route path="/notifications" element={<Notifications />} />
<Route
  path="/businesses"
  element={hasBusiness ? <MyBusinesses /> : <Navigate to="/dashboard" replace />}
/>
<Route
  path="/businesses/:businessId"
  element={hasBusiness ? <BusinessDetail /> : <Navigate to="/dashboard" replace />}
/>
<Route
  path="/matches"
  element={hasBusiness ? <Matches /> : <Navigate to="/dashboard" replace />}
/>
<Route
  path="/offers-received"
  element={hasBusiness ? <OffersReceived /> : <Navigate to="/dashboard" replace />}
/>
          </Routes>
        </div>
      </main>
    </div>
  );
}

function SidebarLink({ to, end, children }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `text-left px-3 py-2 text-sm rounded-lg transition-colors ${
          isActive
            ? "bg-zinc-800 text-zinc-100"
            : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function DashboardHome({ user, caps }) {
  const isInvestor = !!caps.isInvestor;
  const hasBusiness = !!caps.hasBusiness;

  return (
    <>
      <h1 className="text-2xl font-semibold mb-6">Welcome, {user?.name}</h1>

      <div className="grid grid-cols-3 gap-4">
        {hasBusiness && (
          <StatCard label="Businesses" value={caps.businessCount ?? 0} />
        )}
        {isInvestor && <StatCard label="Matches" value="—" />}
        {isInvestor && <StatCard label="Shortlisted" value="—" />}
        {hasBusiness && <StatCard label="Offers received" value="—" />}
      </div>

      {!isInvestor && !hasBusiness && (
        <div className="mt-8 p-8 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
          <p className="text-zinc-400 mb-4">
            You haven't set up a business or investor profile yet.
          </p>
          <a
            href="/onboarding"
            className="inline-block px-4 py-2 bg-brand hover:bg-brand-hover rounded-lg text-sm font-medium"
          >
            Get started
          </a>
        </div>
      )}

      {(isInvestor || hasBusiness) && (
        <div className="mt-8 p-8 bg-zinc-900 border border-zinc-800 rounded-xl text-center text-zinc-500">
          Your data will appear here.
        </div>
      )}
    </>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-xl">
      <div className="text-xs text-zinc-500 uppercase tracking-wider">{label}</div>
      <div className="text-2xl font-semibold mt-2">{value}</div>
    </div>
  );
}