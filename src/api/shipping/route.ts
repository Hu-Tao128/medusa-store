import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { IFulfillmentModuleService } from "@medusajs/types"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    // Resolvemos el servicio 'fulfillment' que descubrimos en la depuración.
    const fulfillmentService: IFulfillmentModuleService =
      req.scope.resolve("fulfillment")

    // Usamos el método 'listShippingOptions' de este servicio.
    const shippingOptions = await fulfillmentService.listShippingOptions(
      {}, // Aquí puedes pasar filtros si los necesitas
      { select: ["id", "name", "price_type", "amount"] } // Seleccionamos solo los campos necesarios
    )

    res.status(200).json({ shipping_options: shippingOptions })
  } catch (error) {
    console.error("Error fetching shipping options:", error)
    res.status(500).json({ error: error.message })
  }
}
