import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Menu,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import PastelBackground from "../../components/common/PastelBackground";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How it Works", href: "#how-it-works" },
];

const features = [
  {
    icon: ShieldCheck,
    title: "Verified businesses",
    description:
      "Every company can upload official documents so investors know exactly who they are backing.",
    accent: "bg-indigo-50 text-indigo-600",
  },
  {
    icon: Users,
    title: "Smarter matching",
    description:
      "We connect founders with investors who fit their sector, stage, and cheque size.",
    accent: "bg-indigo-50 text-indigo-600",
  },
  {
    icon: TrendingUp,
    title: "Structured offers",
    description:
      "Compare every offer side by side with clear terms, amounts, and equity in one place.",
    accent: "bg-orange-50 text-orange-700",
  },
];

const steps = [
  {
    number: "01",
    title: "Create your profile",
    description:
      "Businesses and investors build a clear, verified profile in minutes. No spreadsheets, no cold emails.",
    icon: Sparkles,
  },
  {
    number: "02",
    title: "Get matched",
    description:
      "Our matching engine surfaces the right opportunities based on sector, stage, location, and ticket size.",
    icon: Users,
  },
  {
    number: "03",
    title: "Grow together",
    description:
      "Chat, review documents, and close the deal with a transparent process built for both sides.",
    icon: TrendingUp,
  },
];

function Logo({ inverted = false }) {
  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-2.5 ${
        inverted ? "text-white" : "text-slate-900"
      }`}
      aria-label="SmartShark home"
    >
      <span
        className={`flex h-9 w-9 items-center justify-center rounded-lg ${
          inverted
            ? "bg-indigo-100 text-slate-900"
            : "bg-slate-900 text-white"
        }`}
      >
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
      <span className="font-heading text-lg font-semibold tracking-tight">
        SmartShark
      </span>
    </Link>
  );
}

export default function Landing() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <PastelBackground>
      <header
        className={`sticky top-0 z-40 border-b transition-colors duration-150 ${
          scrolled
            ? "border-slate-200 bg-white/90 backdrop-blur-xl"
            : "border-transparent bg-transparent"
        }`}
      >
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Logo />

          <nav
            className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex"
            aria-label="Main navigation"
          >
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Link to="/login" className="btn-ghost">
              Log In
            </Link>
            <Link to="/register" className="btn-primary">
              Sign Up
            </Link>
          </div>

          <button
            type="button"
            onClick={() => setMenuOpen((value) => !value)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 md:hidden"
            aria-expanded={menuOpen}
            aria-label="Toggle navigation menu"
          >
            {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {menuOpen && (
          <div className="border-t border-slate-200 bg-white px-4 pb-5 pt-3 md:hidden">
            <nav className="flex flex-col gap-1" aria-label="Mobile navigation">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMenuOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="mt-3 flex flex-col gap-2 border-t border-slate-200 pt-3">
              <Link to="/login" className="btn-secondary w-full">
                Log In
              </Link>
              <Link to="/register" className="btn-primary w-full">
                Sign Up
              </Link>
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="border-b border-slate-200 bg-gradient-to-b from-indigo-100/70 via-white/40 to-transparent">
          <div className="mx-auto max-w-5xl px-4 pb-20 pt-20 text-center sm:px-6 sm:pb-28 sm:pt-28">
            <div className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-4 py-1.5 text-xs font-medium text-slate-700">
              <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
              The virtual shark tank for ambitious founders
            </div>

            <h1 className="mx-auto max-w-4xl text-balance text-4xl font-bold tracking-[-0.02em] text-slate-900 sm:text-5xl lg:text-6xl">
              Pitch Smarter. Match Better. Grow Faster.
            </h1>

            <p className="mx-auto mt-6 max-w-2xl text-pretty text-lg text-slate-600 sm:text-xl">
              Your Next Investor Could Already Be Here.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link
                to="/register?role=business"
                className="btn-accent btn-lg w-full sm:w-auto"
              >
                I am a Business
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/register?role=investor"
                className="btn-secondary btn-lg w-full sm:w-auto"
              >
                I am an Investor
              </Link>
            </div>

            <p className="mt-6 text-sm text-slate-500">
              Free to join. Verified profiles. Transparent offers.
            </p>
          </div>
        </section>

        <section
          id="features"
          className="scroll-mt-24 border-b border-slate-200 bg-white"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <p className="overline">Features</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                Everything you need to raise with confidence
              </h2>
              <p className="mt-4 text-base text-slate-600">
                Built for founders who want to be taken seriously and investors
                who want clarity before they commit.
              </p>
            </div>

            <div className="joined-grid mt-12 sm:grid-cols-2 lg:grid-cols-3">
              {features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article key={feature.title} className="joined-cell p-6">
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-lg ${feature.accent}`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-5 text-lg font-semibold text-slate-900">
                      {feature.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {feature.description}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section
          id="how-it-works"
          className="scroll-mt-24 border-b border-slate-200 bg-slate-50"
        >
          <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
            <div className="mx-auto max-w-2xl text-center">
              <p className="overline">How it Works</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">
                From first pitch to first cheque
              </h2>
              <p className="mt-4 text-base text-slate-600">
                Three simple steps. No gatekeepers, no endless introductions.
              </p>
            </div>

            <div className="joined-grid mt-12 md:grid-cols-3">
              {steps.map((step) => {
                const Icon = step.icon;
                return (
                  <article key={step.number} className="joined-cell relative p-7">
                    <span className="absolute right-6 top-6 text-sm font-semibold text-slate-300">
                      {step.number}
                    </span>
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-indigo-100 text-slate-900">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="mt-6 text-lg font-semibold text-slate-900">
                      {step.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {step.description}
                    </p>
                  </article>
                );
              })}
            </div>

            <div className="mt-12 flex justify-center">
              <Link to="/register" className="btn-primary btn-lg">
                Get started for free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-700 bg-slate-900 text-indigo-100">
        <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            <div className="lg:col-span-2">
              <Logo inverted />
              <p className="mt-4 max-w-sm text-sm leading-relaxed text-indigo-100/70">
                A transparent fundraising platform connecting ambitious founders
                with the right investors.
              </p>
            </div>

            <div className="border-t border-slate-700 pt-6 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
              <h3 className="text-sm font-semibold text-white">Product</h3>
              <ul className="mt-4 space-y-3 text-sm text-indigo-100/70">
                <li>
                  <a href="#features" className="transition-colors hover:text-white">
                    Features
                  </a>
                </li>
                <li>
                  <a
                    href="#how-it-works"
                    className="transition-colors hover:text-white"
                  >
                    How it Works
                  </a>
                </li>
                <li>
                  <Link to="/register" className="transition-colors hover:text-white">
                    Sign Up
                  </Link>
                </li>
              </ul>
            </div>

            <div className="border-t border-slate-700 pt-6 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
              <h3 className="text-sm font-semibold text-white">Account</h3>
              <ul className="mt-4 space-y-3 text-sm text-indigo-100/70">
                <li>
                  <Link to="/login" className="transition-colors hover:text-white">
                    Log In
                  </Link>
                </li>
                <li>
                  <Link
                    to="/register?role=business"
                    className="transition-colors hover:text-white"
                  >
                    For Businesses
                  </Link>
                </li>
                <li>
                  <Link
                    to="/register?role=investor"
                    className="transition-colors hover:text-white"
                  >
                    For Investors
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-slate-700 pt-6 text-sm text-indigo-100/60 sm:flex-row">
            <p>© {new Date().getFullYear()} SmartShark. All rights reserved.</p>
            <p>Built for founders and investors.</p>
          </div>
        </div>
      </footer>
    </PastelBackground>
  );
}
