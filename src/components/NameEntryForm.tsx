"use client";

import { useActionState } from "react";
import { signInWithNameAction } from "@/actions/users";
import { SubmitButton } from "@/components/SubmitButton";
import type { ActionResult } from "@/lib/validation";

export function NameEntryForm() {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    signInWithNameAction,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      <label htmlFor="displayName" className="block text-sm font-medium text-foam/70">
        What should we call you?
      </label>
      <input
        id="displayName"
        name="displayName"
        type="text"
        autoComplete="off"
        autoCapitalize="words"
        enterKeyHint="go"
        maxLength={40}
        required
        placeholder="e.g. Ravi"
        className="tap w-full rounded-2xl border border-night-700 bg-night-900 px-4 text-lg outline-none placeholder:text-foam/30 focus:border-amber-glow"
      />

      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      <SubmitButton
        pendingLabel="Pouring…"
        className="bg-amber-glow text-night-950 hover:bg-amber-deep"
      >
        Start drinking
      </SubmitButton>

      <p className="text-xs text-foam/40">
        No password, no email. Your name is remembered on this device until you switch users.
      </p>
    </form>
  );
}
