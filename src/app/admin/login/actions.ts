"use server";

import { redirect } from "next/navigation";
import { createAdminSession, destroyAdminSession } from "@/lib/admin/auth";

export async function adminSignInAction(formData: FormData) {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string") {
    redirect("/admin/login?error=1");
  }

  if (!(await createAdminSession(email, password))) {
    redirect("/admin/login?error=1");
  }

  redirect("/admin");
}

export async function adminSignOutAction() {
  await destroyAdminSession();
  redirect("/admin/login");
}
