import { useState } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import {
  Bell,
  Bookmark,
  Building2,
  Home,
  LogOut,
  Menu,
  MessageSquare,
  PieChart,
  Send,
  Settings,
  Briefcase,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "../stores/auth";
import Feed from "./investor/Feed";
import ShortlistPage from "./investor/Shortlist";
import MyOffers from "./investor/MyOffers";
import Portfolio from "./investor/Portfolio";
import Messages from "./Messages";
import Notifications from "./Notifications";
import SettingsPage from "./investor/Settings";
import MyBusinesses from "./business/MyBusinesses";
import BusinessProfile from "./business/BusinessDetail";
import BusinessDetail from "./investor/CompanyProfile";
import Matches from "./business/Matches";
import OffersReceived from "./business/OffersReceived";

export default function Dashboard() {
  const user = useAuth((s) => s.user);
  const logout = useAuth((s) => s.logout);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const caps = user?.capabilities || {};
  const isInvestor = !!caps.isInvestor;
  const hasBusiness = !!caps.hasBusiness;
  const isAdmin = !!caps.isAdmin;
  const needsOnboarding = !isInvestor && !hasBusiness && !isAdmin;

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 lg:flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm lg:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white p-4 transition-transform duration-200 lg:static lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="mb-8 flex items-center justify-between px-2">
          <NavLink
            to="/dashboard"
            onClick={closeSidebar}
            className="flex items-center gap-2.5 text-slate-900"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-900 text-white">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M3 17c4.5 0 7.2-2.2 9-6 1.8 3.8 4.5 6 9 6" />
                <path d="M12 11V4l5 3.5L12 11z" />
              </svg>
            </span>
            <span className="font-heading text-base font-semibold tracking-tight">
              SmartShark
            </span>
          </NavLink>

          <button
            type="button"
            onClick={closeSidebar}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900 lg:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1" aria-label="Dashboard navigation">
          {isInvestor && (
            <>
              <SidebarLink to="/dashboard" end icon={Home} onClick={closeSidebar}>
                Home
              </SidebarLink>
              <SidebarLink to="/dashboard/feed" icon={Users} onClick={closeSidebar}>
                Feed
              </SidebarLink>
              <SidebarLink
                to="/dashboard/shortlist"
                icon={Bookmark}
                onClick={closeSidebar}
              >
                Shortlist
              </SidebarLink>
              <SidebarLink
                to="/dashboard/offers"
                icon={Send}
                onClick={closeSidebar}
              >
                My Offers
              </SidebarLink>
              <SidebarLink
                to="/dashboard/portfolio"
                icon={PieChart}
                onClick={closeSidebar}
              >
                Portfolio
              </SidebarLink>
              <SidebarLink
                to="/dashboard/messages"
                icon={MessageSquare}
                onClick={closeSidebar}
              >
                Messages
              </SidebarLink>
              <SidebarLink
                to="/dashboard/notifications"
                icon={Bell}
                onClick={closeSidebar}
              >
                Notifications
              </SidebarLink>
            </>
          )}

          {hasBusiness && (
            <>
              <SidebarLink to="/dashboard" end icon={Home} onClick={closeSidebar}>
                Home
              </SidebarLink>
              <SidebarLink
                to="/dashboard/businesses"
                icon={Building2}
                onClick={closeSidebar}
              >
                My Businesses
              </SidebarLink>
              <SidebarLink
                to="/dashboard/pitches"
                icon={Briefcase}
                onClick={closeSidebar}
              >
                Pitches
              </SidebarLink>
              <SidebarLink
                to="/dashboard/matches"
                icon={Users}
                onClick={closeSidebar}
              >
                Matches
              </SidebarLink>
              <SidebarLink
                to="/dashboard/offers-received"
                icon={Send}
                onClick={closeSidebar}
              >
                Offers
              </SidebarLink>
              <SidebarLink
                to="/dashboard/messages"
                icon={MessageSquare}
                onClick={closeSidebar}
              >
                Messages
              </SidebarLink>
              <SidebarLink
                to="/dashboard/notifications"
                icon={Bell}
                onClick={closeSidebar}
              >
                Notifications
              </SidebarLink>
            </>
          )}

          {isAdmin && (
            <SidebarLink
              to="/dashboard/review"
              icon={Briefcase}
              onClick={closeSidebar}
            >
              Review Queue
            </SidebarLink>
          )}

          {needsOnboarding && (
            <SidebarLink
              to="/onboarding"
              icon={Home}
              onClick={closeSidebar}
            >
              Get started
            </SidebarLink>
          )}

          <div className="mt-auto pt-4">
            <SidebarLink
              to="/dashboard/settings"
              icon={Settings}
              onClick={closeSidebar}
            >
              Settings
            </SidebarLink>
          </div>
        </nav>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col lg:min-w-0">
        <div className="flex flex-1 flex-col lg:min-w-0">
          <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 lg:hidden"
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" />
              </button>

              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium text-slate-800">{user?.name}</span>
                {isInvestor && (
                  <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                    Investor
                  </span>
                )}
                {hasBusiness && (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                    Business
                  </span>
                )}
                {isAdmin && (
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700">
                    Admin
                  </span>
                )}
              </div>
            </div>

            <button
              onClick={logout}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Log out</span>
            </button>
          </header>

          <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
            <Routes>
              <Route path="/" element={<DashboardHome user={user} caps={caps} />} />

              {/* ─── Investor-only listing routes (guarded) ─── */}
              <Route
                path="/feed"
                element={isInvestor ? <Feed /> : <Navigate to="/dashboard" replace />}
              />
              <Route
                path="/shortlist"
                element={
                  isInvestor ? <ShortlistPage /> : <Navigate to="/dashboard" replace />
                }
              />
              <Route
                path="/offers"
                element={isInvestor ? <MyOffers /> : <Navigate to="/dashboard" replace />}
              />
              <Route
                path="/portfolio"
                element={
                  isInvestor ? <Portfolio /> : <Navigate to="/dashboard" replace />
                }
              />

              {/* ─── Business-only listing routes (guarded) ─── */}
              <Route
                path="/businesses"
                element={
                  hasBusiness ? <MyBusinesses /> : <Navigate to="/dashboard" replace />
                }
              />
              <Route
                path="/matches"
                element={hasBusiness ? <Matches /> : <Navigate to="/dashboard" replace />}
              />
              <Route
                path="/offers-received"
                element={
                  hasBusiness ? <OffersReceived /> : <Navigate to="/dashboard" replace />
                }
              />

              {/* ─── Detail routes (unguarded; server enforces ownership) ─── */}
              <Route path="/match/:matchId" element={<BusinessDetail />} />
              <Route path="/browse/:businessId" element={<BusinessDetail />} />
              <Route path="/company/:businessId" element={<BusinessDetail />} />

              {/* Owner-editable profile (separate component) */}
              <Route path="/businesses/:businessId" element={<BusinessProfile />} />

              {/* ─── Shared ─── */}
              <Route path="/messages" element={<Messages />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/settings" element={<SettingsPage />} />

              {/* ─── Catch-all (must be last) ─── */}
              <Route
                path="*"
                element={<div className="text-sm text-slate-500">Coming soon.</div>}
              />
            </Routes>
          </main>
        </div>
      </div>
    </div>
  );
}

function SidebarLink({ to, end, icon: Icon, children, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `flex items-center gap-3 border-l-[3px] px-3 py-2.5 text-sm font-medium transition-colors ${
          isActive
            ? "border-slate-900 bg-tint font-semibold text-slate-900"
            : "border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        }`
      }
    >
      {Icon ? <Icon className="h-4 w-4 flex-shrink-0" /> : null}
      {children}
    </NavLink>
  );
}

function DashboardHome({ user, caps }) {
  const isInvestor = !!caps.isInvestor;
  const hasBusiness = !!caps.hasBusiness;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          Welcome, {user?.name}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Here is an overview of your SmartShark activity.
        </p>
      </div>

      <div className="joined-grid sm:grid-cols-2 lg:grid-cols-3">
        {hasBusiness && (
          <StatCard label="Businesses" value={caps.businessCount ?? 0} />
        )}
        {isInvestor && <StatCard label="Matches" value="—" />}
        {isInvestor && <StatCard label="Shortlisted" value="—" />}
        {hasBusiness && <StatCard label="Offers received" value="—" />}
      </div>

      {!isInvestor && !hasBusiness && (
        <div className="card mt-8 p-8 text-center">
          <p className="mb-5 text-sm text-slate-600">
            You haven't set up a business or investor profile yet.
          </p>
          <a href="/onboarding" className="btn-primary">
            Get started
          </a>
        </div>
      )}

      {(isInvestor || hasBusiness) && (
        <div className="card mt-8 flex flex-col items-center justify-center p-10 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
            <PieChart className="h-5 w-5" />
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Your data will appear here as you start making connections.
          </p>
        </div>
      )}
    </>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="joined-cell p-5">
      <div className="overline">
        {label}
      </div>
      <div className="tabular-nums mt-2 text-3xl font-bold text-slate-900">{value}</div>
    </div>
  );
}
