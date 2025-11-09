import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type CustomProductsService from "../../../../modules/custom-products/service"

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const { type = "all" } = req.query

  try {
    const customProducts = req.scope.resolve("customProducts")

    // Si tienes el método getRecommendations en el service:
    const recommendations = await customProducts.getRecommendations(id, type as string)


    res.json({
      product_id: id,
      type,
      count: recommendations.length,
      recommendations,
    })
  } catch (error: any) {
    console.error("Error in recommendations endpoint:", error)
    res.status(500).json({
      message: "Error fetching recommendations",
      error: error.message,
    })
  }
}
