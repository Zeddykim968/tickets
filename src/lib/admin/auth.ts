import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const ADMIN_COOKIE = "frontrow_admin_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

type AdminConfig = {
  email: string;
  password: string;
  sessionSecret: string;
};

function adminConfig(): AdminConfig {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;

  if (!email || !password || !sessionSecret) {
    throw new Error(
      "Admin access is not configured. Set ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_SESSION_SECRET.",
    );
  }
  if (password.length < 16) {
    throw new Error("ADMIN_PASSWORD must be at least 16 characters.");
  }
  if (sessionSecret.length < 32) {
    throw new Error("ADMIN_SESSION_SECRET must be at least 32 characters.");
  }

  return { email, password, sessionSecret };
}

function digest(value: string, key: string) {
  return createHmac("sha256", key).update(value).digest();
}

function safeEqual(left: string, right: string, key: string) {
  return timingSafeEqual(digest(left, key), digest(right, key));
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export async function createAdminSession(email: string, password: string) {
  const config = adminConfig();
  const validEmail = safeEqual(email.trim().toLowerCase(), config.email, config.sessionSecret);
  const validPassword = safeEqual(password, config.password, config.sessionSecret);

  if (!validEmail || !validPassword) return false;

  const payload = Buffer.from(
    JSON.stringify({
      email: config.email,
      expiresAt: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
      credentialVersion: sign(config.password, config.sessionSecret),
    }),
  ).toString("base64url");
  const token = `${payload}.${sign(payload, config.sessionSecret)}`;
  const cookieStore = await cookies();

  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  return true;
}

export async function getAdminSession() {
  const config = adminConfig();
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (!token) return null;

  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  if (!safeEqual(signature, sign(payload, config.sessionSecret), config.sessionSecret)) return null;

  try {
    const parsed: unknown = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("email" in parsed) ||
      !("expiresAt" in parsed) ||
      !("credentialVersion" in parsed)
    ) {
      return null;
    }

    const session = parsed as {
      email: unknown;
      expiresAt: unknown;
      credentialVersion: unknown;
    };
    if (
      session.email !== config.email ||
      typeof session.expiresAt !== "number" ||
      session.expiresAt <= Math.floor(Date.now() / 1000) ||
      typeof session.credentialVersion !== "string" ||
      !safeEqual(
        session.credentialVersion,
        sign(config.password, config.sessionSecret),
        config.sessionSecret,
      )
    ) {
      return null;
    }

    return { email: config.email };
  } catch {
    return null;
  }
}

export async function destroyAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE);
}
