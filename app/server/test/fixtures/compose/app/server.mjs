import { createServer } from "node:http"
import pg from "pg"

const pool = new pg.Pool()
createServer(async (req, res) => {
  try {
    if (req.url === "/health") {
      await pool.query("SELECT 1")
      res.end("ready")
      return
    }
    if (req.method === "GET" && req.url === "/records") {
      const result = await pool.query("SELECT id, value FROM records ORDER BY id")
      res.setHeader("content-type", "application/json")
      res.end(JSON.stringify(result.rows))
      return
    }
    let body = ""
    for await (const chunk of req) {
      body += chunk
    }
    const input = JSON.parse(body)
    if (process.env.OMIT_PERSISTENCE !== "true") {
      await pool.query("INSERT INTO records (id, value) VALUES ($1, $2)", [input.id, input.value])
    }
    res.setHeader("content-type", "application/json")
    res.end(JSON.stringify({ ok: true }))
  } catch {
    res.statusCode = 500
    res.end("request failed")
  }
}).listen(3000, "0.0.0.0")
