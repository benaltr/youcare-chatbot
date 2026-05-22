import { db, schema } from "@/lib/db";
import { embedText } from "@/lib/rag/embed";

const STUDIO_LUME_PERSONA_PROMPT = `אתה Shelly, עוזרת הזימונים של Studio Lume — קליניקת לייזר ואסתטיקה יוקרתית בתל אביב.
את מדברת בחום ובמקצועיות, כמו מארחת בבית מלון חמישה כוכבים — בטוחה בעצמך, רגועה ועוזרת, ולעולם לא רובוטית או מכירתית.
את מדברת בצניעות על טיפולים ולעולם לא מציעה ייעוץ רפואי.

את כותבת בהודעות קצרות — משפט-שניים לכל בועה — עם רווח בין מחשבות. את משתמשת באימוג'ים במידה: רק ✨, 🌸, 💆‍♀️, ✅, 📅. לעולם לא 🤖, 🔥, 💯.

המטרה שלך בכל שיחה: לגרום ללקוחה להרגיש רגועה ומטופלת. הזימון צריך להרגיש כמו שירות קונסיירז', לא טופס.

You are bilingual — Hebrew is your default but you switch to English if a customer writes a full sentence in English.`;

const NAIL_BUSINESS_PERSONA_PROMPT = `אתה Rona, עוזרת הזימונים של Nail Studio — סטודיו ציפורניים פרימיום בישראל.
את מדברת בחום וברוגע, כמו חברה טובה שמטפלת בך — בטוחה בעצמך, מקצועית אך לא פורמלית.
את מדברת בצניעות על טיפולים ולעולם לא מציעה ייעוץ רפואי.

את כותבת בהודעות קצרות — משפט-שניים לכל בועה — עם רווח בין מחשבות. את משתמשת באימוג'ים במידה: רק ✨, 💅, 💄, ✅, 📅. לעולם לא 🤖, 🔥, 💯.

המטרה שלך בכל שיחה: לגרום ללקוחה להרגיש רגועה ומיוחדת. הזימון צריך להרגיש כמו טיפול חברותי, לא טופס.

You are bilingual — Hebrew is your default but you switch to English if a customer writes a full sentence in English.`;

const NAIL_FAQ_CONTENT = `# Nail Studio FAQ - צפורניים וטיפול

## הכנה וטיפול

### איך אני מכינה את עצמי לפגישה?
- שמרו על ידיים נקיות וייבשות
- הסירו כל ציפוי ציפורניים קיים
- הימנעו משימוש בקרם ועל מעל 2 שעות לפני הפגישה
- הביאו תמונות של עיצוב שאתן רוצות אם יש לכן רעיון מסוים

### מה האחרונה לציפורניים ג'ל?
- שמרו על ציפורניים יבשות 24 שעות
- השתמשו בשמן קוטיקולה יומיומי
- הימנעו מכימיקלים קשים וחשיפה מופרזת למים
- ציפורניים ג'ל נמשכות בדרך כלל 3-4 שבועות
- קבעו פגישת הסרה כדי למנוע נזק

### כמה זמן אחרון מניקור רגיל?
- מניקור רגיל: 5-7 ימים
- מניקור ג'ל: 3-4 שבועות
- עיצוב ציפורניים: תלוי בתוך הדיזיין, 1-2 שבועות

## זימון וביטול

### יכול לשנות זימון?
כן! אתם יכולים לשנות את הזימון עד 24 שעות לפני הפגישה דרך האפליקציה או על ידי הודעה אלינו.

### מה מדיניות הביטול?
- ביטול חינם עד 24 שעות לפני הפגישה
- ביטול באחרון (תוך 24 שעות) כרוך בחיוב של 50% מהמחיר
- אי-הופעה מחויבת במחיר מלא

### אילו שיטות תשלום אתם מקבלים?
אנו מקבלים כרטיסי אשראי, כרטיסי חיוב וגם מזומן. התשלום יכול להיעשות במהלך או אחרי הפגישה.

## שירותים ומחירים

### מה ההבדל בין ג'ל לציפורניים רגילות?
- מניקור רגיל: לק ציפורניים, נמשך 5-7 ימים
- מניקור ג'ל: לק ג'ל עם ריפוי UV, נמשך 3-4 שבועות, עמיד יותר

### האם אתם מציעים הסבות?
כן, אנו מציעים הסבות אקריליק וג'ל. ייעוצים הם חינם כדי לדון מה הטוב ביותר עבורכן.

### כמה עולה עיצוב ציפורניים?
עיצוב ציפורניים תמחור תלוי בתוך המורכבות. עיצובים פשוטים מוסיפים ₪20-50. עיצובים מורכבים יכולים להיות ₪100+. שאלו במהלך הייעוץ שלכן!`;

// Simple text chunking function - split by sentences and respect max chunk size
function chunkText(text: string, maxChunkSize: number = 500): string[] {
  const chunks: string[] = [];
  const lines = text.split("\n").filter((line) => line.trim());

  let currentChunk = "";

  for (const line of lines) {
    if ((currentChunk + "\n" + line).length > maxChunkSize && currentChunk) {
      chunks.push(currentChunk.trim());
      currentChunk = line;
    } else {
      currentChunk = currentChunk ? currentChunk + "\n" + line : line;
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks.filter((chunk) => chunk.length > 0);
}

async function seedStudioLume() {
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
  return tenant.id;
}

async function seedNailBusiness() {
  console.log("Seeding nail-business demo tenant...");

  const [tenant] = await db
    .insert(schema.tenants)
    .values({
      slug: "nail-business",
      name: "Nail Studio Demo",
      domain: "nail-business.local",
      whatsappNumber: "+1234567890",
      languageDefault: "he",
      status: "demo",
    })
    .onConflictDoUpdate({
      target: schema.tenants.slug,
      set: { name: "Nail Studio Demo", status: "demo" },
    })
    .returning();

  // Seed tenant config
  await db
    .insert(schema.tenantConfigs)
    .values({
      tenantId: tenant.id,
      personaName: "Rona",
      personaSystemPrompt: NAIL_BUSINESS_PERSONA_PROMPT,
      brandColors: {
        primary: "#e91e63",
        secondary: "#ffc0cb",
        accent: "#fff5f8",
      },
      businessHours: {
        sunday: { open: "10:00", close: "19:00" },
        monday: { open: "10:00", close: "19:00" },
        tuesday: { open: "10:00", close: "19:00" },
        wednesday: { open: "10:00", close: "19:00" },
        thursday: { open: "10:00", close: "19:00" },
        friday: { open: "10:00", close: "17:00" },
      },
      handoffMessage: "רגע, אני קוראת למישהי מהצוות שתשיב לך בקרוב 💅",
      emojiPalette: ["✨", "💅", "💄", "✅", "📅"],
    })
    .onConflictDoUpdate({
      target: schema.tenantConfigs.tenantId,
      set: { personaSystemPrompt: NAIL_BUSINESS_PERSONA_PROMPT },
    });

  // Seed services
  const services = await db
    .insert(schema.services)
    .values([
      {
        tenantId: tenant.id,
        slug: "manicure",
        name: "מניקור",
        nameTranslations: { en: "Manicure" },
        durationMinutes: 30,
        bufferMinutes: 10,
        priceCents: 5000, // 50 NIS
        category: "hand",
        prepInstructions:
          "הסירו ציפוי קיים והביאו הנושא מעל המים בחמים למשך 5 דקות",
        active: "true",
      },
      {
        tenantId: tenant.id,
        slug: "pedicure",
        name: "פדיקור",
        nameTranslations: { en: "Pedicure" },
        durationMinutes: 40,
        bufferMinutes: 10,
        priceCents: 6000, // 60 NIS
        category: "foot",
        prepInstructions: "בואו עם רגליים נקיות, בחוזקה מעל המים בחמים",
        active: "true",
      },
      {
        tenantId: tenant.id,
        slug: "gel-nails",
        name: "ג'ל ציפורניים",
        nameTranslations: { en: "Gel Nails" },
        durationMinutes: 45,
        bufferMinutes: 10,
        priceCents: 7000, // 70 NIS
        category: "hand",
        prepInstructions: "הסירו ציפוי קיים והיו בטוחים שידיים נקיות וייבשות",
        aftercareInstructions: "שמרו על ציפורניים יבשות 24 שעות, השתמשו בשמן קוטיקולה יומיומי",
        active: "true",
      },
      {
        tenantId: tenant.id,
        slug: "nail-art",
        name: "עיצוב ציפורניים",
        nameTranslations: { en: "Nail Art" },
        durationMinutes: 60,
        bufferMinutes: 10,
        priceCents: 8500, // 85 NIS base, varies by complexity
        category: "hand",
        prepInstructions: "הביאו תמונות של העיצובים שרוצים או תיעצו איתנו",
        aftercareInstructions: "הזהרו עם עיצובים מורכבים, הימנעו מנזקים",
        active: "true",
      },
    ])
    .returning();

  console.log(`✓ Seeded ${services.length} services`);

  // Seed staff (nail technicians)
  const staff = await db
    .insert(schema.staff)
    .values([
      {
        tenantId: tenant.id,
        name: "אמירה",
        qualifications: ["certified_nail_technician", "nail_art_specialist"],
        active: "true",
      },
      {
        tenantId: tenant.id,
        name: "לירון",
        qualifications: ["certified_nail_technician", "gel_specialist"],
        active: "true",
      },
      {
        tenantId: tenant.id,
        name: "חן",
        qualifications: ["certified_nail_technician"],
        active: "true",
      },
    ])
    .returning();

  console.log(`✓ Seeded ${staff.length} staff members`);

  // Seed FAQ document
  const [faqDoc] = await db
    .insert(schema.faqDocuments)
    .values({
      tenantId: tenant.id,
      title: "Nail Care & Booking FAQ",
      sourceType: "markdown",
      language: "he",
      contentRaw: NAIL_FAQ_CONTENT,
    })
    .returning();

  console.log(`✓ Created FAQ document: ${faqDoc.id}`);

  // Chunk and embed FAQ content
  const chunks = chunkText(NAIL_FAQ_CONTENT);
  console.log(`Chunking FAQ into ${chunks.length} segments...`);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    try {
      const embedding = await embedText(chunk);
      await db
        .insert(schema.faqChunks)
        .values({
          documentId: faqDoc.id,
          tenantId: tenant.id,
          chunkText: chunk,
          embedding: embedding,
          metadata: {
            chunkIndex: i,
            documentTitle: faqDoc.title,
          },
        })
        .onConflictDoNothing(); // Skip if chunk already exists
    } catch (error) {
      console.error(`Error embedding chunk ${i}:`, error);
      throw error;
    }
  }

  console.log(`✓ Embedded and indexed ${chunks.length} FAQ chunks`);
  console.log(`✓ Seeded tenant: ${tenant.slug} (${tenant.id})`);
  return tenant.id;
}

async function main() {
  try {
    await seedStudioLume();
    await seedNailBusiness();

    console.log("\n✅ All demo tenants seeded successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Seeding failed:", err);
    process.exit(1);
  }
}

main();
