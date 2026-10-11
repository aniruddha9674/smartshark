import { useNavigate } from "react-router-dom";

export default function ChoosePath() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md flex flex-col gap-4 p-8 bg-zinc-900 border border-zinc-800 rounded-xl">
        <h1 className="text-2xl font-semibold mb-2">What do you want to do?</h1>
        <p className="text-sm text-zinc-500 mb-4">
          You can do both later. Pick one to start.
        </p>

        <button
          onClick={() => navigate("/onboarding/business")}
          className="p-4 text-left bg-zinc-950 border border-zinc-800 rounded-lg hover:border-brand transition-colors"
        >
          <div className="font-medium text-zinc-100">I own a business</div>
          <div className="text-sm text-zinc-500 mt-1">
            Create a business profile, upload documents, pitch for investment.
          </div>
        </button>

        <button
          onClick={() => navigate("/onboarding/investor")}
          className="p-4 text-left bg-zinc-950 border border-zinc-800 rounded-lg hover:border-brand transition-colors"
        >
          <div className="font-medium text-zinc-100">I'm an investor</div>
          <div className="text-sm text-zinc-500 mt-1">
            Browse matched businesses, shortlist, and make offers.
          </div>
        </button>
      </div>
    </div>
  );
}