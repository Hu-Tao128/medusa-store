import express from "express"
import path from "path"

export default async function (container, config, { app }) {
  const uploadsPath = path.join(process.cwd(), "static", "uploads")

  console.log("Sirviendo /uploads desde:", uploadsPath)

  app.use("/uploads", express.static(uploadsPath))
}
