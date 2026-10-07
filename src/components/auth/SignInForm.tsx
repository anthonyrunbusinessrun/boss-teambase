"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { Field, FormError } from "@/components/forms/Field";
import { TextInput } from "@/components/forms/Inputs";
import { useNow } from "@/hooks/useNow";
import { authService, errorMessage } from "@/services";
import { safeNextPath } from "@/lib/safe-next";
import { formatClock } from "@/lib/time";
import { getZone, zoneHeaderLabel } from "@/lib/zones";
import styles from "./SignIn.module.css";

const NOTICES: Record<string, string> = {
  "signed-out": "You've been signed out.",
  expired: "Your session ended. Sign in again to pick up where you left off.",
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function SignInForm() {
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const queryNotice = params.has("verified")
    ? "Email verified. You can sign in now."
    : params.has("verification-error")
      ? "That verification link is invalid or expired. Create your account again to receive a fresh link."
      : NOTICES[params.get("reason") ?? ""];
  const emailRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [department, setDepartment] = useState("");
  const [formError, setFormError] = useState<string>();
  const [notice, setNotice] = useState<string | undefined>(queryNotice);
  const [busy, setBusy] = useState(false);

  useEffect(() => { emailRef.current?.focus(); }, [mode]);

  const switchMode = (nextMode: "signin" | "signup") => {
    setMode(nextMode); setFormError(undefined); setNotice(undefined); setPassword("");
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFormError(undefined); setNotice(undefined);
    const normalizedEmail = email.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalizedEmail)) return setFormError("Enter a valid work email.");
    if (password.length < (mode === "signup" ? 10 : 1)) return setFormError(mode === "signup" ? "Use at least 10 characters for your password." : "Enter your password.");
    if (mode === "signup" && (!name.trim() || !role.trim() || !department.trim())) return setFormError("Complete your name, job title, and department.");

    setBusy(true);
    try {
      if (mode === "signin") {
        await authService.login(normalizedEmail, password);
        window.location.assign(next);
      } else {
        const result = await authService.signup({ email: normalizedEmail, password, name: name.trim(), role: role.trim(), department: department.trim() });
        setNotice(result.message);
        setMode("signin");
        setPassword("");
      }
    } catch (error) {
      setFormError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.column}>
        <div className={styles.brand}><Image src="/brand/teambase-wordmark.png" alt="teambase" width={210} height={23} priority unoptimized /></div>
        <Card variant="bento" as="section" flush className={styles.card} aria-labelledby="signin-title">
          <div className={styles.tabs} role="tablist" aria-label="Account access">
            <button type="button" role="tab" aria-selected={mode === "signin"} className={mode === "signin" ? styles.activeTab : ""} onClick={() => switchMode("signin")}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === "signup"} className={mode === "signup" ? styles.activeTab : ""} onClick={() => switchMode("signup")}>Create profile</button>
          </div>
          <h1 id="signin-title" className={styles.title}>{mode === "signin" ? "Welcome back" : "Create your profile"}</h1>
          <p className={styles.lead}>{mode === "signin" ? "Use your verified work account to open Teambase." : "Join your team workspace. We'll verify your email before the first sign-in."}</p>
          {notice && <p className={styles.notice} role="status">{notice}</p>}
          <form className={styles.form} onSubmit={submit} noValidate>
            <FormError message={formError} />
            {mode === "signup" && <>
              <Field label="Full name"><TextInput value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" /></Field>
              <div className={styles.formGrid}>
                <Field label="Job title"><TextInput value={role} onChange={(event) => setRole(event.target.value)} /></Field>
                <Field label="Department"><TextInput value={department} onChange={(event) => setDepartment(event.target.value)} /></Field>
              </div>
            </>}
            <Field label="Work email">
              <TextInput ref={emailRef} wrapperClassName={styles.field} type="email" name="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="name@company.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field label="Password" hint={mode === "signup" ? "At least 10 characters" : undefined}>
              <TextInput wrapperClassName={styles.field} type="password" name="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(event) => setPassword(event.target.value)} />
            </Field>
            <Button type="submit" variant="primary" block className={styles.submit} disabled={busy}>
              {busy ? (mode === "signin" ? "Signing in…" : "Creating profile…") : (mode === "signin" ? "Sign in" : "Create profile")}
            </Button>
          </form>
        </Card>
        <p className={styles.help}>Teambase is for the BOSS team.<br />Use an email address you can verify.</p>
        <TeamClocks />
      </div>
    </main>
  );
}

function TeamClocks() {
  const now = useNow();
  const zones = [getZone("manila"), getZone("chicago")];
  return <div className={styles.clocks} role="group" aria-label="Team time zones">{zones.map((zone) => (
    <div key={zone.id} className={styles.clock}>
      <span className="micro-label">{zoneHeaderLabel(zone, now ?? new Date(0))}</span>
      <span className={styles.clockTime} suppressHydrationWarning>{now ? formatClock(now, zone.tz) : "--:-- --"}</span>
    </div>
  ))}</div>;
}
