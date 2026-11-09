require("dotenv").config({ path: ".env.local" });
const postgres = require("postgres");

const url = process.env.DATABASE_URL;
console.log("DATABASE_URL set:", Boolean(url));

const sql = postgres(url, { prepare: false, connect_timeout: 10 });

(async () => {
  try {
    console.log("events:", await sql`select count(*)::int as n from events`);
    console.log("seats:", await sql`select count(*)::int as n from seats`);
    console.log(
      "seats columns:",
      (
        await sql`select column_name from information_schema.columns where table_name = 'seats' order by ordinal_position`
      ).map((r) => r.column_name)
    );
  } catch (e) {
    console.error("ERROR:", e.message, "| code:", e.code);
  } finally {
    await sql.end();
  }
})();