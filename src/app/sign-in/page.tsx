import Link from "next/link";

export default function SignIn() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-20">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-bold tracking-tight text-[15px] block text-center mb-10">
          phantom<span className="text-accent">coach</span>
        </Link>
        <div className="bg-surface border border-border-soft rounded-lg p-8">
          <h1 className="text-2xl font-bold tracking-tight mb-1">Welcome back</h1>
          <p className="text-[13px] text-text-muted mb-7">
            Sign in to your Phantomcoach account.
          </p>
          <div className="rounded-md border border-dashed border-border bg-bg p-6 text-center">
            <p className="text-[12px] text-text-muted">
              Clerk authentication will live here.
              <br />
              For the demo, jump straight in →
            </p>
            <Link
              href="/onboarding"
              className="inline-block mt-4 px-5 py-2.5 bg-accent hover:bg-accent-h text-white text-[12.5px] font-semibold rounded-md transition"
            >
              Continue to demo
            </Link>
          </div>
        </div>
        <p className="text-center text-[12px] text-text-muted mt-5">
          New here?{" "}
          <Link href="/onboarding" className="text-accent font-semibold hover:underline">
            Start free trial
          </Link>
        </p>
      </div>
    </main>
  );
}
