import express from "express";
import "dotenv/config";
import pool from "./src/db/client.ts";

const app = express();

app.use(express.json());

const PORT = process.env.PORT;



//database health check
app.get("/db_health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      status: "healthy",
      database: "connected",
    });
  } catch (err) {
    res.status(500).json({
      status: "unhealthy",
      database: "disconnected",
      error: (err as Error).message,
    });
  }
});


app.listen(PORT, () => {
    console.log(`API running successfully on ${PORT}`)
});

