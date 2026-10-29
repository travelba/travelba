import { redirect } from "next/navigation";

export default function TonightRedirect() {
  redirect("/admin/restaurants");
}
