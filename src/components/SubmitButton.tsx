"use client";

import { useFormStatus } from "react-dom";

type Props = {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  disabled?: boolean;
};

/**
 * Disables itself while the action is in flight — the single most useful guard
 * against a double-tap logging two drinks.
 */
export function SubmitButton({ children, pendingLabel, className = "", disabled }: Props) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className={`tap inline-flex w-full items-center justify-center rounded-2xl px-5 text-base font-semibold transition active:scale-[0.98] disabled:opacity-60 ${className}`}
    >
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}
