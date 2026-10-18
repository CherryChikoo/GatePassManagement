import { getAuthUser } from "@/lib/auth/helpers";
import { downloadAvatarAdmin } from "@/lib/storage/storage-admin";

/**
 * Profile photo. Signed-in users only. The address carries ?v=<when it was
 * set>, so the browser keeps the picture until it changes — almost no repeat
 * downloads (free-tier friendly). Not under /api, whose responses are never cached.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const user = await getAuthUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { profileId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(profileId)) return new Response("Not found", { status: 404 });

  const bytes = await downloadAvatarAdmin(profileId);
  if (!bytes) return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });

  return new Response(bytes, {
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
