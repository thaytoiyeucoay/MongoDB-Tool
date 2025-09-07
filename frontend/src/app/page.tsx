import { redirect } from "next/navigation";

export default function Home() {
  redirect("/management");
  return null;
}
