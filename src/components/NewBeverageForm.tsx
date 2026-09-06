"use client";

import { useActionState } from "react";
import { createBeverageAction } from "@/actions/beverages";
import { SubmitButton } from "@/components/SubmitButton";
import type { ActionResult } from "@/lib/validation";

const STYLE_SUGGESTIONS = [
  "IPA",
  "Lager",
  "Pilsner",
  "Stout",
  "Porter",
  "Pale Ale",
  "Wheat",
  "Sour",
  "Cider",
  "Non-alcoholic",
];

export function NewBeverageForm({ barcode, brandHint }: { barcode?: string; brandHint?: string }) {
  const [state, formAction] = useActionState<ActionResult | null, FormData>(
    createBeverageAction,
    null,
  );

  const fieldError = (field: string) => state && !state.ok && state.fieldErrors?.[field]?.[0];

  return (
    <form action={formAction} className="space-y-3">
      {barcode && <input type="hidden" name="barcode" value={barcode} />}

      {barcode && (
        <p className="rounded-2xl border border-night-700 bg-night-900 px-4 py-3 text-sm text-foam/60">
          Barcode <span className="font-mono text-foam">{barcode}</span> isn&apos;t in our catalog or
          Open Food Facts. Fill this in once and it&apos;s there for everyone next time.
          {brandHint && (
            <>
              {" "}
              It shares a manufacturer code with{" "}
              <span className="text-foam">{brandHint}</span>, so we&apos;ve guessed the brand —
              change it if that&apos;s wrong.
            </>
          )}
        </p>
      )}

      <Field label="Name" name="name" error={fieldError("name")} required autoFocus placeholder="Neck Oil" />
      {/* Uncontrolled with defaultValue: the guess is a starting point the user
          types over, not a value the form owns. */}
      <Field
        label="Brand"
        name="brand"
        error={fieldError("brand")}
        defaultValue={brandHint}
        placeholder="Beavertown"
      />

      <div>
        <Field
          label="Style"
          name="style"
          error={fieldError("style")}
          list="style-suggestions"
          placeholder="Session IPA"
        />
        <datalist id="style-suggestions">
          {STYLE_SUGGESTIONS.map((style) => (
            <option key={style} value={style} />
          ))}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="ABV %"
          name="abv"
          error={fieldError("abv")}
          type="number"
          inputMode="decimal"
          step="0.1"
          min="0"
          max="100"
          placeholder="4.3"
        />
        <Field
          label="Volume ml"
          name="volumeMl"
          error={fieldError("volumeMl")}
          type="number"
          inputMode="numeric"
          step="1"
          min="10"
          placeholder="330"
        />
      </div>

      <p className="text-xs text-foam/40">
        Leave ABV or volume blank if you don&apos;t know — this drink then counts towards your raw
        total only. We never guess a strength.
      </p>

      {state && !state.ok && (
        <p role="alert" className="text-sm text-red-400">
          {state.error}
        </p>
      )}

      <SubmitButton
        pendingLabel="Saving…"
        className="h-14 bg-amber-glow text-lg text-night-950 hover:bg-amber-deep"
      >
        Save &amp; continue
      </SubmitButton>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  ...inputProps
}: {
  label: string;
  name: string;
  error?: string | false | null;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className="mb-1 block text-sm font-medium text-foam/70">
        {label}
      </label>
      <input
        id={name}
        name={name}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        className="tap w-full rounded-2xl border border-night-700 bg-night-900 px-4 text-base outline-none placeholder:text-foam/25 focus:border-amber-glow aria-[invalid=true]:border-red-500"
        {...inputProps}
      />
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
}
