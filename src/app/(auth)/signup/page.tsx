import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "../AuthShell";
import { GoogleButton, OrDivider } from "../GoogleButton";
import { SignupForm } from "./SignupForm";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <AuthShell title="Join the cypher">
      <GoogleButton />
      <OrDivider />
      <SignupForm />
      <p className="text-center text-dim">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-gold underline-offset-4 hover:underline">Log in</Link>
      </p>
    </AuthShell>
  );
}
