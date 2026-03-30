import pkg from "../../../package.json"

export async function GET() {
  return new Response(JSON.stringify({ version: pkg.version }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })
}
