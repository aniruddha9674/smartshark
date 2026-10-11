import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../../stores/auth";
import { getErrorMessage } from "../../lib/api";

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

const inputClass =
  "px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-lg text-zinc-100 outline-none focus:border-brand";

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
    <div className="min-h-screen flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="w-full max-w-sm flex flex-col gap-4 p-8 bg-zinc-900 border border-zinc-800 rounded-xl"
      >
        <h1 className="text-2xl font-semibold mb-2">Create account</h1>

        <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
          Name
          <input autoComplete="name" {...register("name")} className={inputClass} />
          {errors.name && <span className="text-red-400 text-xs">{errors.name.message}</span>}
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
          Email
          <input type="email" autoComplete="email" {...register("email")} className={inputClass} />
          {errors.email && <span className="text-red-400 text-xs">{errors.email.message}</span>}
        </label>

        <label className="flex flex-col gap-1.5 text-sm text-zinc-400">
          Password
          <input type="password" autoComplete="new-password" {...register("password")} className={inputClass} />
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
          {isSubmitting ? "Creating..." : "Create account"}
        </button>

        <p className="text-sm text-center text-zinc-500">
          Already have an account?{" "}
          <Link to="/login" className="text-brand hover:underline">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}