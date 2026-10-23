import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Field, Input } from "@/components/ui";
import { appConfig } from "@/app.config";
import logoWhite from "@/assets/vestas/Secondary_RGB.svg";

/** Sign-in: the Night Sky bar at the top, a quiet form on the white canvas. One accent button. */
export function LoginPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (!data.get("username") || !data.get("password")) { setError("Enter your username and password."); return; }
    setBusy(true);
    window.setTimeout(() => navigate("/"), 500);
  };

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="on-shell bg-shell text-shell-ink">
        <div className="mx-auto flex h-14 max-w-[1564px] items-center px-4 sm:px-6 lg:px-8">
          <span className="text-heading font-medium">{appConfig.productName}</span>
          <img src={logoWhite} alt="Vestas" className="ml-auto h-4 w-auto" />
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-sm flex-1 px-4 pt-16 sm:pt-24">
        <h1 className="text-title font-light text-ink">Sign in</h1>
        <p className="mt-2 text-ui text-ink-2">Use your Vestas account.</p>
        <Button variant="accent" className="mt-8 w-full">Sign in with Microsoft</Button>
        <div className="my-8 flex items-center gap-3 text-meta text-ink-2"><span className="h-px flex-1 bg-rule" />or with a local account<span className="h-px flex-1 bg-rule" /></div>
        <form onSubmit={submit} className="grid gap-5" noValidate>
          <Field label="Username"><Input name="username" autoComplete="username" /></Field>
          <Field label="Password" error={error ?? undefined}><Input name="password" type="password" autoComplete="current-password" /></Field>
          <Button type="submit" loading={busy}>Sign in</Button>
        </form>
      </main>
    </div>
  );
}
