/**
 * Username rules. Mirrors `public.is_valid_username()` in the database.
 */
export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export const RESERVED_USERNAMES: readonly string[] = [
  "admin",
  "administrator",
  "api",
  "auth",
  "help",
  "mod",
  "moderator",
  "official",
  "rhymetyme",
  "rhyme_tyme",
  "root",
  "settings",
  "staff",
  "support",
  "system",
];

export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

export type UsernameProblem = "too_short" | "too_long" | "invalid_chars" | "reserved";

export function validateUsername(input: string): UsernameProblem | null {
  const name = normalizeUsername(input);
  if (name.length < 3) return "too_short";
  if (name.length > 20) return "too_long";
  if (!USERNAME_PATTERN.test(name)) return "invalid_chars";
  if (RESERVED_USERNAMES.includes(name)) return "reserved";
  return null;
}

export const USERNAME_PROBLEM_MESSAGES: Record<UsernameProblem, string> = {
  too_short: "Usernames need at least 3 characters.",
  too_long: "Usernames can be at most 20 characters.",
  invalid_chars: "Use only letters, numbers, and underscores.",
  reserved: "That username is reserved. Try another.",
};
