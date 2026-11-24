import { LockKeyhole, TriangleAlert } from "lucide-react";
import { useState, type FormEvent } from "react";
import { errorText } from "../lib/api";
import { usePulse } from "../state/pulse";
import { Button, Field, Sheet } from "./ui";

export function LoginSheet() {
  const { loginOpen, setLoginOpen, login, info, go } = usePulse();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const close = () => {
    setLoginOpen(false);
    setPassword("");
    setError("");
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(email, password);
      close();
      go("studio");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={loginOpen} onClose={close} width={400}>
      <form onSubmit={submit} className="p-7">
        <div className="squircle mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[18px] bg-accent-soft text-accent">
          <LockKeyhole size={24} />
        </div>
        <h2 className="t-title text-center">Studio Nexora</h2>
        <p className="mt-1 mb-5 text-center text-muted">Connecte-toi avec ton compte éditeur.</p>
        <div className="space-y-3">
          <Field label="E-mail">
            <input className="field" type="email" autoComplete="username" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Mot de passe">
            <input className="field" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
        </div>
        {info && !info.secure && (
          <p className="mt-3.5 flex gap-2 rounded-xl bg-[color-mix(in_srgb,var(--orange)_12%,transparent)] p-2.5 text-[12px] leading-snug text-[var(--orange)]">
            <TriangleAlert size={14} className="mt-px shrink-0" />
            Connexion au serveur non chiffrée (HTTP). Évite un mot de passe que tu utilises ailleurs.
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-center text-[13px] font-medium text-[var(--red)]">
            {error}
          </p>
        )}
        <Button type="submit" disabled={busy} className="mt-5 !h-10 w-full">
          {busy ? "Connexion..." : "Se connecter"}
        </Button>
      </form>
    </Sheet>
  );
}
