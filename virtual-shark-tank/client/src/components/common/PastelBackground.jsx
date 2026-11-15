export default function PastelBackground({ children, className = "" }) {
  return (
    <div
      className={`relative isolate min-h-screen bg-[#f8fafc] ${className}`}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -left-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-indigo-100 opacity-70 blur-3xl motion-safe:animate-blob" />
        <div className="absolute -right-32 top-24 h-[28rem] w-[28rem] rounded-full bg-orange-100 opacity-50 blur-3xl motion-safe:animate-blob-slow" />
        <div className="absolute -bottom-40 left-1/3 h-[30rem] w-[30rem] rounded-full bg-indigo-100 opacity-60 blur-3xl motion-safe:animate-blob" />
      </div>
      {children}
    </div>
  );
}
