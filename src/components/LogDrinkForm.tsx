"use client";

import { useActionState } from "react";
import { logDrinkAction } from "@/actions/logs";
import { SubmitButton } from "@/components/SubmitButton";
import type { ActionResult } from "@/lib/validation";

export function LogDrinkForm({
  beverageId,
  children,
}: {
  beverageId: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(logDrinkAction, null);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="beverageId" value={beverageId} />
      {children}

      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      <SubmitButton
        pendingLabel="Saving…"
        className="h-14 bg-amber-glow text-lg text-night-950 hover:bg-amber-deep"
      >
        Save drink
      </SubmitButton>
    </form>
  );
}
