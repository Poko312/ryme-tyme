import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { GoogleButton, OrDivider } from "../GoogleButton";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Log in" };

const ERRORS: Record<string, string> = {
  link: "That link is invalid or expired. Log in, or sign up again to get a new link.",
  google: "Google sign-in didn't work. Try again or use email.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : undefined;
  const errorKey = typeof params.error === "string" ? params.error : undefined;

  return (
    <AuthShell title="Welcome back">
      <GoogleButton next={next} />
      <OrDivider />
      <LoginForm next={next} initialError={errorKey ? ERRORS[errorKey] : undefined} />
      <p className="text-center text-dim">
        New here?{" "}
        <Link href="/signup" className="font-semibold text-gold underline-offset-4 hover:underline">Create an account</Link>
      </p>
    </AuthShell>
  );
}
