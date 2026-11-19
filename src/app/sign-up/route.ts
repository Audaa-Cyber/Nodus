import { redirect } from "next/navigation";

export async function GET() {
  redirect("/login?mode=signup");
}
