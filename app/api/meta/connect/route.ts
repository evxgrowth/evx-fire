import { NextResponse, type NextRequest } from "next/server";
import { randomBytes } from "crypto";
import { getMe } from "@/lib/auth";
import { loginDialogUrl } from "@/lib/meta/graph";

/** Início do "Conectar com Facebook": manda o gestor para a janela oficial da Meta. */
export async function GET(req: NextRequest) {
  const me = await getMe();
  if (!me?.agencyId) return NextResponse.redirect(new URL("/login", req.url));

  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(loginDialogUrl(req.nextUrl.origin, state));
  res.cookies.set("meta_oauth_state", state, { httpOnly: true, secure: req.nextUrl.protocol === "https:", sameSite: "lax", maxAge: 600, path: "/" });
  return res;
}
