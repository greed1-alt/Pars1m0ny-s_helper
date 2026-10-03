// Edge Function clever-task: тестовая рассылка пуш-уведомления на все подписки из push_subscriptions.
// Копия кода из панели Supabase (Edge Functions → clever-task → Code). Публикуется кнопкой «Deploy updates» там же.
// Секретов в файле нет: ключи VAPID и служебные ключи Supabase берутся из переменных окружения функции.
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

const clean = (v: string | undefined) =>
  (v ?? "").trim().replace(/^["']|["']$/g, "");

webpush.setVapidDetails(
  clean(Deno.env.get("VAPID_SUBJECT")),
  clean(Deno.env.get("VAPID_PUBLIC_KEY")),
  clean(Deno.env.get("VAPID_PRIVATE_KEY"))
);

// Запускать рассылку может только владелец проекта:
// 1) новый секретный ключ sb_secret_… в заголовке apikey (в окне Test: Add header → Add secret key);
// 2) старый ключ service_role в заголовке Authorization — его подпись проверяет сам Supabase,
//    поэтому переключатель «Verify JWT with legacy secret» в настройках функции должен оставаться включённым.
// Открытый ключ из приложения (sb_publishable_…, anon) получает 403.
const secretKeys: string[] = (() => {
  try {
    return Object.values(JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}")).map(String);
  } catch {
    return [];
  }
})();
const jwtRole = (req: Request): string => {
  try {
    const t = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    return JSON.parse(atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role ?? "";
  } catch {
    return "";
  }
};
const isOwner = (req: Request): boolean => {
  const key = req.headers.get("apikey") ?? "";
  return (key.startsWith("sb_secret_") && secretKeys.includes(key)) || jwtRole(req) === "service_role";
};

Deno.serve(async (req: Request) => {
  if (!isOwner(req)) return new Response("Forbidden", { status: 403 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: subs, error } = await supabase
    .from("push_subscriptions")
    .select("*");
  if (error) return new Response(error.message, { status: 500 });

  const payload = JSON.stringify({
    title: "Parsimony",
    body: "Тест: уведомления работают!",
  });

  // По одной строке на устройство: ok — доставлено; 404/410 — подписка устарела и удаляется
  const results: string[] = [];
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload
      );
      results.push("ok");
    } catch (e: any) {
      results.push(`${e.statusCode ?? ""} ${e.body ?? e.message}`);
      if (e.statusCode === 404 || e.statusCode === 410) {
        await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }
  }
  return new Response(JSON.stringify(results));
});
