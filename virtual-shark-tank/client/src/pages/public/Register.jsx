import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../stores/auth";
import { getErrorMessage } from "../../lib/api";
import PastelBackground from "../../components/common/PastelBackground";

const schema = z.object({
  name: z.string().min(2, "Min 2 characters"),
  email: z.string().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Min 8 characters")
    .regex(/[A-Z]/, "Needs uppercase")
    .regex(/[a-z]/, "Needs lowercase")
    .regex(/[0-9]/, "Needs a number"),
});

const inputClass = "input";

export default function Register() {
  const navigate = useNavigate();
  const signup = useAuth((s) => s.register);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (data) => {
    try {
      await signup(data);
      navigate("/onboarding");
    } catch (err) {
      setError("root", { message: getErrorMessage(err) });
    }
  };

  return (
    <PastelBackground className="flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 text-slate-900"
            aria-label="SmartShark home"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white"
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
            <span className="text-xl font-semibold tracking-tight">SmartShark</span>
          </Link>
        </div>

        <form
          onSubmit={handleSubmit(onSubmit)}
          className="w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="mb-7 text-center">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              Create your account
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Join SmartShark and start building meaningful connections.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Name
              </span>
              <input
                autoComplete="name"
                placeholder="Your full name"
                {...register("name")}
                className={inputClass}
              />
              {errors.name && (
                <span className="mt-1.5 block text-xs text-red-600">
                  {errors.name.message}
                </span>
              )}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </span>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@company.com"
                {...register("email")}
                className={inputClass}
              />
              {errors.email && (
                <span className="mt-1.5 block text-xs text-red-600">
                  {errors.email.message}
                </span>
              )}
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                {...register("password")}
                className={inputClass}
              />
              {errors.password && (
                <span className="mt-1.5 block text-xs text-red-600">
                  {errors.password.message}
                </span>
              )}
            </label>

            {errors.root && (
              <div
                role="alert"
                className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700"
              >
                {errors.root.message}
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary mt-1 w-full"
            >
              {isSubmitting ? "Creating account..." : "Create account"}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-slate-600">
            Already have an account?{" "}
            <Link
              to="/login"
              className="font-semibold text-slate-900 underline-offset-4 hover:underline"
            >
              Log in
            </Link>
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          By signing up you agree to our terms and privacy policy.
        </p>
      </div>
    </PastelBackground>
  );
}
