import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../stores/auth";
import { getErrorMessage } from "../../lib/api";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password required"),
});

const inputClass =
  "px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 outline-none focus:border-brand";

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
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm flex flex-col gap-4 p-8 bg-zinc-900 border border-zinc-800 rounded-xl"
      >
        <h1 className="text-2xl font-semibold mb-2">Welcome back</h1>

        <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
          Email
          <input type="email" autoComplete="email" {...register("email")} className={inputClass} />
          {errors.email && <span className="text-red-400 text-xs">{errors.email.message}</span>}
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
          Password
          <input type="password" autoComplete="current-password" {...register("password")} className={inputClass} />
          {errors.password && <span className="text-red-400 text-xs">{errors.password.message}</span>}
        </label>

        {errors.root && (
          <div className="px-3 py-2 text-sm bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg">
            {errors.root.message}
          </div>
        )}

        <button
          type="submit"
          disabled={isSubmitting}
          className="px-4 py-2 bg-brand hover:bg-brand-hover rounded-lg text-sm font-medium disabled:opacity-50"
        >
          {isSubmitting ? "Logging in..." : "Log in"}
        </button>

        <p className="text-sm text-center text-zinc-500">
          Don't have an account?{" "}
          <Link to="/register" className="text-brand hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}