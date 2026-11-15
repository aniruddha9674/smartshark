import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../stores/auth";
import { getErrorMessage } from "../../lib/api";
import PastelBackground from "../../components/common/PastelBackground";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password required"),
});

const inputClass = "input";

export default function Login() {
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm({ resolver: zodResolver(schema) });

  const onSubmit = async (data) => {
    try {
      await login(data.email, data.password);
      navigate("/dashboard");
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
              Welcome back
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Log in to continue to your dashboard.
            </p>
          </div>

          <div className="flex flex-col gap-4">
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
                autoComplete="current-password"
                placeholder="Enter your password"
                {...register("password")}
                className={inputClass}
              />
              {errors.password && (
                <span className="mt-1.5 block text-xs text-red-600">
                  {errors.password.message}
                </span>
              )}
            </label>

            <div className="flex justify-end">
              <a
                href="#"
                onClick={(event) => event.preventDefault()}
                className="text-sm font-medium text-slate-600 transition-colors hover:text-slate-900"
              >
                Forgot Password?
              </a>
            </div>

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
              {isSubmitting ? "Logging in..." : "Login"}
            </button>
          </div>

          <p className="mt-6 text-center text-sm text-slate-600">
            Don't have an account?{" "}
            <Link
              to="/register"
              className="font-semibold text-slate-900 underline-offset-4 hover:underline"
            >
              Sign up
            </Link>
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Secure, verified, and built for founders.
        </p>
      </div>
    </PastelBackground>
  );
}
