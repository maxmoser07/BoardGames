import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertCircle,
  CircleCheckBig,
  Dice5,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Mail,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ Schema */

const loginSchema = z.object({
  email: z
    .string()
    .min(1, "Please enter your email address.")
    .email("Please enter a valid email address."),
  password: z
    .string()
    .min(1, "Please enter your password.")
    .min(8, "Your password must be at least 8 characters long."),
  remember: z.boolean(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

/* -------------------------------------------------------------------- Types */

export interface LoginProps {
  /**
   * Called with the validated values. Without a handler, the page simulates
   * an API call (1 s) and logs the payload.
   */
  onSubmit?: (values: LoginFormValues) => Promise<void>;
  /**
   * Opens the provider's consent screen. The browser is redirected to
   * `/api/auth/oauth/{provider}/start`; the backend returns to
   * `/auth/callback#token=…` after the sign-in.
   */
  onOAuthLogin?: (provider: "google" | "github") => void;
  /**
   * When the provider is not configured on the backend the buttons stay
   * visible but disabled; the tooltip explains why.
   */
  oAuthAvailable?: boolean;
}

const DEFAULT_VALUES: LoginFormValues = {
  email: "",
  password: "",
  remember: true,
};

async function simulatedLogin(values: LoginFormValues): Promise<void> {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 1000);
  });
  console.log("[login] payload", values);
}

/* ---------------------------------------------------------- OAuth start */

/**
 * Redirects to the backend's start route. The backend builds the provider's
 * authorize URL, stores the CSRF `state` and sends the browser to the consent
 * screen. After the sign-in the browser lands on `/auth/callback#token=…`.
 */
function startOAuth(provider: "google" | "github"): void {
  window.location.assign(`/api/auth/oauth/${provider}/start`);
}

/* ----------------------------------------------------------------- Component */

export function Login({
  onSubmit = simulatedLogin,
  onOAuthLogin = startOAuth,
  oAuthAvailable = true,
}: LoginProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: DEFAULT_VALUES,
    mode: "onTouched",
  });

  const isSubmitting = form.formState.isSubmitting;

  async function handleSubmit(values: LoginFormValues): Promise<void> {
    setStatus("idle");
    setSubmitError(null);

    try {
      await onSubmit(values);
      setStatus("success");
    } catch (error) {
      setStatus("error");
      setSubmitError(
        error instanceof Error
          ? error.message
          : "We could not sign you in. Please try again.",
      );
    }
  }

  function handleSocialLogin(provider: "Google" | "GitHub"): void {
    onOAuthLogin(provider.toLowerCase() as "google" | "github");
  }

  return (
    <div className="min-h-dvh bg-neutral-50 text-neutral-900 antialiased lg:grid lg:grid-cols-2 dark:bg-neutral-950 dark:text-neutral-50">
      {/* --------------------------------------------------------------- Form */}
      <main className="relative flex min-h-dvh flex-col overflow-hidden px-4 py-10 sm:px-6 lg:px-12 lg:py-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-48 left-1/2 size-[38rem] -translate-x-1/2 rounded-full bg-indigo-500/10 blur-3xl dark:bg-indigo-500/15"
        />

        <div className="relative m-auto w-full max-w-[400px]">
          <header className="mb-8 flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-600/25">
              <Dice5 aria-hidden="true" className="size-5" />
            </span>
            <span className="text-base font-semibold tracking-tight">BoardGames</span>
          </header>

          <Card className="w-full gap-6 border-0 bg-transparent py-0 shadow-none sm:rounded-2xl sm:border sm:border-neutral-200/80 sm:bg-white sm:py-7 sm:shadow-xl sm:shadow-neutral-900/5 dark:sm:border-white/10 dark:sm:bg-neutral-900">
            <CardHeader className="gap-2 px-0 sm:px-7">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.625rem]">
                Welcome back
              </h1>
              <p className="text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">
                Sign in to pick up your games, stats and friends right where you left off.
              </p>
            </CardHeader>

            <CardContent className="flex flex-col gap-6 px-0 sm:px-7">
              {/* Social Login */}
              <div className="grid gap-2.5">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full border-neutral-200 bg-white font-medium hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                  disabled={isSubmitting || !oAuthAvailable}
                  title={
                    oAuthAvailable
                      ? undefined
                      : "Google sign-in is not configured on the server yet."
                  }
                  onClick={() => handleSocialLogin("Google")}
                >
                  <GoogleIcon />
                  Continue with Google
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 w-full border-neutral-200 bg-white font-medium hover:bg-neutral-50 dark:border-white/10 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                  disabled={isSubmitting || !oAuthAvailable}
                  title={
                    oAuthAvailable
                      ? undefined
                      : "GitHub sign-in is not configured on the server yet."
                  }
                  onClick={() => handleSocialLogin("GitHub")}
                >
                  <GitHubIcon />
                  Continue with GitHub
                </Button>
              </div>

              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
                <span className="text-[11px] font-medium tracking-[0.14em] text-neutral-500 uppercase dark:text-neutral-400">
                  or
                </span>
                <span aria-hidden="true" className="h-px flex-1 bg-neutral-200 dark:bg-neutral-800" />
              </div>

              {/* Email / password */}
              <Form {...form}>
                <form
                  noValidate
                  onSubmit={form.handleSubmit(handleSubmit)}
                  className="flex flex-col gap-5"
                >
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <div className="relative">
                          <Mail
                            aria-hidden="true"
                            className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
                          />
                          <FormControl>
                            <Input
                              {...field}
                              type="email"
                              autoComplete="email"
                              autoCapitalize="none"
                              spellCheck={false}
                              inputMode="email"
                              placeholder="you@example.com"
                              disabled={isSubmitting}
                              className="h-11 bg-white pl-10 dark:bg-neutral-900 sm:dark:bg-neutral-950"
                            />
                          </FormControl>
                        </div>
                        <FormDescription>We use this to find your account.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <div className="relative">
                          <Lock
                            aria-hidden="true"
                            className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
                          />
                          <FormControl>
                            <Input
                              {...field}
                              type={showPassword ? "text" : "password"}
                              autoComplete="current-password"
                              autoCapitalize="none"
                              spellCheck={false}
                              placeholder="Enter your password"
                              disabled={isSubmitting}
                              className="h-11 bg-white pr-11 pl-10 dark:bg-neutral-900 sm:dark:bg-neutral-950"
                            />
                          </FormControl>
                          <button
                            type="button"
                            onClick={() => setShowPassword((visible) => !visible)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            aria-pressed={showPassword}
                            className="absolute top-1/2 right-1.5 grid size-8 -translate-y-1/2 place-items-center rounded-md text-neutral-500 transition-colors outline-none hover:bg-neutral-100 hover:text-neutral-900 focus-visible:ring-2 focus-visible:ring-indigo-500/60 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
                          >
                            {showPassword ? (
                              <EyeOff aria-hidden="true" className="size-4" />
                            ) : (
                              <Eye aria-hidden="true" className="size-4" />
                            )}
                          </button>
                        </div>
                        <FormDescription>At least 8 characters.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <FormField
                      control={form.control}
                      name="remember"
                      render={({ field }) => (
                        <FormItem className="flex-row items-center gap-2.5">
                          <Checkbox
                            id="remember-me"
                            checked={field.value}
                            onCheckedChange={(checked) => field.onChange(checked === true)}
                            onBlur={field.onBlur}
                          />
                          <FormLabel
                            htmlFor="remember-me"
                            className="font-normal text-neutral-600 dark:text-neutral-300"
                          >
                            Remember me
                          </FormLabel>
                        </FormItem>
                      )}
                    />

                    <a
                      href="/forgot-password"
                      className="rounded-sm text-sm font-medium text-indigo-600 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50 dark:text-indigo-400 dark:focus-visible:ring-offset-neutral-900"
                    >
                      Forgot password?
                    </a>
                  </div>

                  {submitError ? (
                    <p
                      role="alert"
                      className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                    >
                      <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                      <span>{submitError}</span>
                    </p>
                  ) : null}

                  <Button
                    type="submit"
                    disabled={isSubmitting}
                    aria-busy={isSubmitting}
                    className="h-11 w-full bg-indigo-600 text-[15px] font-semibold text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 focus-visible:ring-indigo-500/60"
                  >
                    {isSubmitting ? (
                      <>
                        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                        Signing in…
                      </>
                    ) : (
                      "Sign in"
                    )}
                  </Button>
                </form>
              </Form>

              <div aria-live="polite" role="status">
                {status === "success" ? (
                  <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300">
                    <CircleCheckBig aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                    <span>You are signed in. Welcome back!</span>
                  </div>
                ) : null}
              </div>
            </CardContent>

            <CardFooter className="justify-center px-0 sm:px-7">
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                Don&apos;t have an account?{" "}
                <a
                  href="/signup"
                  className="rounded-sm font-semibold text-indigo-600 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-50 dark:text-indigo-400 dark:focus-visible:ring-offset-neutral-900"
                >
                  Sign up
                </a>
              </p>
            </CardFooter>
          </Card>

          <p className="mt-6 flex items-center justify-center gap-1.5 text-xs text-neutral-500 dark:text-neutral-400">
            <ShieldCheck aria-hidden="true" className="size-3.5" />
            Protected by industry-standard encryption.
          </p>
        </div>
      </main>

      {/* ----------------------------------------------------------- Brand panel */}
      <aside className="relative hidden overflow-hidden lg:flex lg:flex-col">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-linear-to-br from-indigo-600 via-violet-600 to-fuchsia-600"
        />
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.18)_1px,transparent_0)] [background-size:24px_24px] opacity-70"
        />
        <div
          aria-hidden="true"
          className="absolute -top-32 -right-24 size-[30rem] rounded-full bg-fuchsia-400/30 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-40 -left-24 size-[32rem] rounded-full bg-sky-400/25 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute top-1/2 left-1/2 size-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10"
        />

        <div className="relative z-10 flex flex-1 flex-col justify-between gap-10 p-12 xl:p-16">
          <div className="flex items-center gap-2.5 text-white">
            <span className="grid size-9 place-items-center rounded-xl border border-white/20 bg-white/15 backdrop-blur">
              <Dice5 aria-hidden="true" className="size-5" />
            </span>
            <span className="font-semibold tracking-tight">BoardGames</span>
          </div>

          <div className="max-w-md">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/90 backdrop-blur">
              <Sparkles aria-hidden="true" className="size-3.5" />
              New · Live board tracking
            </p>

            <h2 className="mt-5 text-4xl font-semibold tracking-tight text-balance text-white xl:text-5xl">
              Game night,{" "}
              <span className="text-white/75">wherever you are.</span>
            </h2>

            <p className="mt-4 max-w-sm text-base leading-relaxed text-white/85">
              Bring your table, your friends and your stats together — so the only
              thing left to think about is your next move.
            </p>

            <ul className="mt-8 space-y-3 text-sm text-white/85">
              <li className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10">
                  <Users aria-hidden="true" className="size-4" />
                </span>
                Real-time multiplayer with live sessions
              </li>
              <li className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10">
                  <Sparkles aria-hidden="true" className="size-4" />
                </span>
                Elo ratings and insights for every game
              </li>
              <li className="flex items-center gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10">
                  <ShieldCheck aria-hidden="true" className="size-4" />
                </span>
                Private tables, encrypted and always yours
              </li>
            </ul>
          </div>

          <div className="flex items-center gap-4">
            <div aria-hidden="true" className="flex -space-x-2">
              {["T", "M", "L", "A"].map((initial) => (
                <span
                  key={initial}
                  className="grid size-8 place-items-center rounded-full bg-white/15 text-[11px] font-semibold text-white ring-2 ring-white/20 backdrop-blur"
                >
                  {initial}
                </span>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-white/85">
              Join 12,000+ players who never miss game night.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default Login;

/* --------------------------------------------------------------- Brand icons */

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 48 48"
      className={cn("size-[18px] shrink-0", className)}
    >
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      className={cn("size-[18px] shrink-0", className)}
    >
      <path
        fill="currentColor"
        d="M12 .5C5.73.5.73 5.5.73 11.77c0 4.99 3.24 9.22 7.74 10.72.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.1-3.15.68-3.82-1.34-3.82-1.34-.51-1.3-1.26-1.65-1.26-1.65-1.03-.7.08-.69.08-.69 1.14.08 1.74 1.17 1.74 1.17 1.01 1.73 2.65 1.23 3.3.94.1-.73.4-1.23.72-1.51-2.51-.29-5.15-1.26-5.15-5.6 0-1.24.44-2.25 1.17-3.04-.12-.29-.51-1.44.11-3 0 0 .95-.3 3.11 1.16a10.8 10.8 0 0 1 5.66 0c2.16-1.46 3.11-1.16 3.11-1.16.62 1.56.23 2.71.11 3 .73.79 1.17 1.8 1.17 3.04 0 4.35-2.65 5.31-5.17 5.59.41.35.77 1.05.77 2.12 0 1.53-.01 2.76-.01 3.14 0 .3.2.66.79.55a11.28 11.28 0 0 0 7.73-10.72C23.27 5.5 18.27.5 12 .5z"
      />
    </svg>
  );
}
