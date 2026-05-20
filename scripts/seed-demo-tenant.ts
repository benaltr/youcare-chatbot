import "dotenv/config";
import { db, schema } from "@/lib/db";

const STUDIO_LUME_PERSONA_PROMPT = `אתה Shelly, עוזרת הזימונים של Studio Lume — קליניקת לייזר ואסתטיקה יוקרתית בתל אביב.
את מדברת בחום ובמקצועיות, כמו מארחת בבית מלון חמישה כוכבים — בטוחה בעצמך, רגועה ועוזרת, ולעולם לא רובוטית או מכירתית.
את מדברת בצניעות על טיפולים ולעולם לא מציעה ייעוץ רפואי.

את כותבת בהודעות קצרות — משפט-שניים לכל בועה — עם רווח בין מחשבות. את משתמשת באימוג'ים במידה: רק ✨, 🌸, 💆‍♀️, ✅, 📅. לעולם לא 🤖, 🔥, 💯.

המטרה שלך בכל שיחה: לגרום ללקוחה להרגיש רגועה ומטופלת. הזימון צריך להרגיש כמו שירות קונסיירז', לא טופס.

You are bilingual — Hebrew is your default but you switch to English if a customer writes a full sentence in English.`;

async function main() {
  console.log("Seeding studio-lume demo tenant...");

  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      slug: "studio-lume",
      name: "Studio Lume",
      domain: "studiolume.local",
      languageDefault: "he",
      status: "demo",
    })
    .onConflictDoUpdate({
      target: schema.tenants.slug,
      set: { name: "Studio Lume", status: "demo" },
    })
    .returning();

  await db
    .insert(schema.tenantConfigs)
    .values({
      tenantId: tenant.id,
      personaName: "Shelly",
      personaSystemPrompt: STUDIO_LUME_PERSONA_PROMPT,
      brandColors: {
        primary: "#c8a878",
        secondary: "#1a1a1a",
        accent: "#f5e9d3",
      },
      businessHours: {
        sunday: { open: "10:00", close: "20:00" },
        monday: { open: "10:00", close: "20:00" },
        tuesday: { open: "10:00", close: "20:00" },
        wednesday: { open: "10:00", close: "20:00" },
        thursday: { open: "10:00", close: "20:00" },
        friday: { open: "09:00", close: "14:00" },
      },
      handoffMessage: "רגע, אני קוראת למישהי מהצוות שתשיב לך בקרוב 🌸",
      emojiPalette: ["✨", "🌸", "💆‍♀️", "✅", "📅"],
    })
    .onConflictDoUpdate({
      target: schema.tenantConfigs.tenantId,
      set: { personaSystemPrompt: STUDIO_LUME_PERSONA_PROMPT },
    });

  console.log(`✓ Seeded tenant: ${tenant.slug} (${tenant.id})`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
