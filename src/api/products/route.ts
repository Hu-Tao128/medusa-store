import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve("query")

  try {
    // Obtener productos con variantes y precios
    const { data: products } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "subtitle",
        "description",
        "is_giftcard",
        "status",
        "thumbnail",
        "weight",
        "length",
        "height",
        "width",
        "origin_country",
        "hs_code",
        "mid_code",
        "material",
        "metadata",
        "created_at",
        "updated_at",
        "images.*",
        "variants.*",
        "variants.prices.*",
        "categories.*",
      ],
      filters: {
        status: ["published"],
      },
    })

    // Formatear la respuesta para que sea más fácil de usar en el frontend
    const formattedProducts = products.map(product => ({
      ...product,
      variants: product.variants?.map(variant => ({
        ...variant,
        // Agrupar precios por moneda para facilitar el acceso
        price_set: {
          prices: variant.price_set || []
        }
      }))
    }))

    res.json({
      products: formattedProducts,
      count: formattedProducts.length,
    })
  } catch (error) {
    console.error("Error fetching products:", error)
    res.status(500).json({ 
      error: "Error al obtener productos",
      message: error.message 
    })
  }
}