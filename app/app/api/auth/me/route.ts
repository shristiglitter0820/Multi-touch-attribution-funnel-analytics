import { guard } from "@/lib/auth";

export async function GET() {
  const user = await guard();
  if (user instanceof Response) return user;
  return Response.json({ name: user.name, role: user.role });
}
