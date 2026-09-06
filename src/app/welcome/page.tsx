import { selectUserAction } from "@/actions/users";
import { NameEntryForm } from "@/components/NameEntryForm";
import { listUsers } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const users = await listUsers();

  return (
    <div className="safe-top safe-bottom flex min-h-dvh flex-col justify-center gap-8 px-5 py-10">
      <div>
        <p className="text-5xl" aria-hidden>
          🍺
        </p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Beer Scanner</h1>
        <p className="mt-1 text-foam/60">Scan a can, keep score, settle it later.</p>
      </div>

      {users.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foam/50">
            It&apos;s me
          </h2>
          <ul className="flex flex-wrap gap-2">
            {users.map((user) => (
              <li key={user.id}>
                <form action={selectUserAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button
                    type="submit"
                    className="tap rounded-2xl border border-night-700 bg-night-900 px-4 text-base font-medium transition active:scale-95"
                  >
                    {user.displayName}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-foam/50">
          {users.length > 0 ? "Or add someone new" : "Get started"}
        </h2>
        <NameEntryForm />
      </section>
    </div>
  );
}
