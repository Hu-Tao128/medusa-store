import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
    const query = req.scope.resolve("query")

    try {
        const { data: collections } = await query.graph({
            entity: "product_collection",
            fields: ["id", "title", "handle"],
        })

        res.json({ collections })
    } catch (error) {
        console.error("Error fetching collections:", error)
        res.status(500).json({
            error: "Error al obtener colecciones",
            message: error.message,
        })
    }
}
