import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import IPromotionModuleService from "@medusajs/promotion"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const { id } = req.params

  if (!id) {
    return res.status(400).json({ valid: false, message: "No se proporcionó código" })
  }

  try {
    const promoService = req.scope.resolve("promotion")
    const promotions = await promoService.listPromotions({
      code: id,
      status: "active",
    })

    if (promotions.length > 0) {
      return res.status(200).json({
        valid: true,
        id: promotions[0].id,
        description: promotions[0].campaign?.name,
      })
    }

    return res.status(404).json({
      valid: false,
      message: "Código inválido o inactivo",
    })
  } catch (err) {
    console.error("❌ Error validando código:", err)
    return res.status(500).json({
      valid: false,
      message: "Error interno al validar el código",
    })
  }
}