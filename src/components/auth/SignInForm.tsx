"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/buttons/Button";
import { Card } from "@/components/cards/Card";
import { Field, FormError } from "@/components/forms/Field";
import { TextInput } from "@/components/forms/Inputs";
import { useNow } from "@/hooks/useNow";
import { DEFAULT_SIGN_IN_EMAIL } from "@/config/auth";
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

/**
 * Sign-in only — no password, and deliberately no sign-up (accounts are provisioned by an administrator).
 * The work email is pre-filled, so one click on "Sign in" goes straight in; change it to enter as another teammate.
 */
export function SignInForm() {
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const notice = NOTICES[params.get("reason") ?? ""];

  const emailRef = useRef<HTMLInputElement>(null);
  const [email, setEmail] = useState(DEFAULT_SIGN_IN_EMAIL);
  const [emailError, setEmailError] = useState<string>();
  const [formError, setFormError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setFormError(undefined);
    const value = email.trim();
    const problem = !value ? "Enter your work email." : !EMAIL_PATTERN.test(value) ? "Enter a valid email address, like name@company.com." : undefined;
    setEmailError(problem);
    if (problem) return emailRef.current?.focus();

    setBusy(true);
    try {
      await authService.login(value);
      // Full navigation so the app starts fresh with the new session cookie.
      window.location.assign(next);
    } catch (err) {
      setBusy(false);
      setFormError(errorMessage(err));
      emailRef.current?.select();
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.glow} aria-hidden="true" />
      <div className={styles.column}>
        <div className={styles.brand}>
          <Image src="/brand/teambase-wordmark.png" alt="teambase" width={210} height={23} priority unoptimized />
        </div>

        <Card variant="bento" as="section" flush className={styles.card} aria-labelledby="signin-title">
          <h1 id="signin-title" className={styles.title}>
            Sign in
          </h1>
          <p className={styles.lead}>Continue with your work email to open Teambase.</p>

          {notice && !formError && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}

          <form className={styles.form} onSubmit={submit} noValidate>
            <FormError message={formError} />
            <Field label="Work email" error={emailError}>
              <TextInput
                ref={emailRef}
                wrapperClassName={styles.field}
                type="email"
                name="email"
                inputMode="email"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                invalid={!!emailError}
              />
            </Field>
            <Button type="submit" variant="primary" block className={styles.submit} disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </Card>

        <p className={styles.help}>
          Teambase is for the BOSS team.
          <br />
          Need access? Ask your workspace administrator.
        </p>
        <TeamClocks />
      </div>
    </main>
  );
}

/** The two pinned time zones from the app header, so the first thing you see is the team's time. */
function TeamClocks() {
  const now = useNow();
  const zones = [getZone("manila"), getZone("chicago")];
  return (
    <div className={styles.clocks} role="group" aria-label="Team time zones">
      {zones.map((z) => (
        <div key={z.id} className={styles.clock}>
          <span className="micro-label">{zoneHeaderLabel(z, now ?? new Date(0))}</span>
          <span className={styles.clockTime} suppressHydrationWarning>
            {now ? formatClock(now, z.tz) : "--:-- --"}
          </span>
        </div>
      ))}
    </div>
  );
}
