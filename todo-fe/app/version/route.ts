import packageJSON from "../../package.json"

export async function GET() {
  return new Response(JSON.stringify({ version: packageJSON.version }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
