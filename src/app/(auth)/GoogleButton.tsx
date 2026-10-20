import { GoogleIcon } from "@/components/GoogleIcon";
import { buttonClass } from "@/components/ui";
import { continueWithGoogle } from "./actions";

export function GoogleButton({ next }: { next?: string }) {
  return (
    <form action={continueWithGoogle}>
      <input type="hidden" name="next" value={next ?? ""} />
      <button type="submit" className={buttonClass("secondary", "w-full")}>
        <GoogleIcon /> Continue with Google
      </button>
    </form>
  );
}

export function OrDivider() {
  return (
    <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-dim">
      <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
    </div>
  );
}
