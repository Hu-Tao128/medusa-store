import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const { type = "all", limit = 4 } = req.query

  try {
    // ✅ 1. Resolver el servicio desde el scope del request
    const customProductsService = req.scope.resolve("customProductsService")

    // ✅ 2. Llamar a un método seguro dentro del service
    const recommendations = await customProductsService.getRecommendations(id, type as string)

    res.json({
      recommendations,
      count: recommendations.length,
      type,
      product_id: id,
    })

  } catch (error) {
    console.error("Error in recommendations endpoint:", error)

    res.status(500).json({
      message: "Error fetching recommendations",
      error: error.message,
    })
  }
}
