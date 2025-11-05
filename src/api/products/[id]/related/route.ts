import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

type ProductWithCustom = {
  id: string
  custom?: {
    related_products?: string[]
  }
}

export const GET = async (req: MedusaRequest, res: MedusaResponse) => {
  const { id } = req.params
  const query = req.scope.resolve("query")

  const { data } = await query.graph({
    entity: "product",
    fields: [
      "id",
      "custom.related_products"
    ],
    filters: { id }
  })

  const product = (data as ProductWithCustom[])[0]
  let relatedProducts: any[] = []

  if (product?.custom?.related_products?.length) {
    const { data } = await query.graph({
      entity: "product",
      fields: ["*"],
      filters: { id: product.custom.related_products }
    })
    relatedProducts = data
  }

  res.json({ related_products: relatedProducts })
}