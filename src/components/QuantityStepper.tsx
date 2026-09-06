"use client";

import { useState } from "react";

const MIN = 1;
const MAX = 20;

export function QuantityStepper({ name = "quantity" }: { name?: string }) {
  const [quantity, setQuantity] = useState(1);

  return (
    <div>
      <input type="hidden" name={name} value={quantity} />
      <div className="flex items-center justify-between gap-4 rounded-3xl border border-night-700 bg-night-900 p-3">
        <StepButton
          label="One fewer"
          disabled={quantity <= MIN}
          onClick={() => setQuantity((q) => Math.max(MIN, q - 1))}
        >
          −
        </StepButton>

        <div className="text-center">
          <p className="text-4xl font-bold tabular-nums" aria-live="polite">
            {quantity}
          </p>
          <p className="text-xs text-foam/50">{quantity === 1 ? "drink" : "drinks"}</p>
        </div>

        <StepButton
          label="One more"
          disabled={quantity >= MAX}
          onClick={() => setQuantity((q) => Math.min(MAX, q + 1))}
        >
          +
        </StepButton>
      </div>
    </div>
  );
}

function StepButton({
  children,
  label,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="h-16 w-16 shrink-0 rounded-2xl bg-night-700 text-3xl font-bold leading-none transition active:scale-95 disabled:opacity-40"
    >
      {children}
    </button>
  );
}
