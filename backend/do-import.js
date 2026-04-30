const XLSX = require("xlsx");

async function main() {
  const wb = XLSX.readFile("/tmp/import.xlsx");
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  console.log("  Parsed " + rows.length + " rows");
  console.log("  First row:", JSON.stringify(rows[0]));

  const loginRes = await fetch("http://localhost:5000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@ditech.co.th", password: "Admin123!" })
  });
  const loginData = await loginRes.json();
  const token = loginData.data.token;
  console.log("  Logged in");

  const importRes = await fetch("http://localhost:5000/api/installation-plans/bulk-import", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + token
    },
    body: JSON.stringify({ rows })
  });
  const importData = await importRes.json();
  console.log("");
  console.log("  Result:");
  console.log(JSON.stringify({
    success: importData.success,
    created: importData.data?.created,
    failed: importData.data?.failed
  }, null, 2));

  if (importData.data?.failed > 0) {
    console.log("  Sample failures:");
    const fails = importData.data.details.filter(d => d.status === "error").slice(0, 5);
    fails.forEach(f => console.log("    Row " + f.row + ":", f.message));
  }

  if (!importData.success) {
    console.log("  Full error response:");
    console.log(JSON.stringify(importData, null, 2));
  }
}

main().catch(e => { console.error("ERROR:", e.message, e.stack); process.exit(1); });
