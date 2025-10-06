import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve("query")

  try {
    // Obtener categorías activas
    const { data: categories } = await query.graph({
      entity: "product_category",
      fields: ["id", "name", "handle", "parent_category_id"],
      filters: {
        is_active: [true],
      },
    })

    // Construir jerarquía padre-hijo (opcional)
    const buildTree = (list: any[], parentId: string | null = null) =>
      list
        .filter(cat => cat.parent_category_id === parentId)
        .map(cat => ({
          id: cat.id,
          name: cat.name,
          handle: cat.handle,
          children: buildTree(list, cat.id),
        }))

    const categoryTree = buildTree(categories)

    res.json({ categories: categoryTree })
  } catch (error) {
    console.error("Error fetching categories:", error)
    res.status(500).json({
      error: "Error al obtener categorías",
      message: error.message,
    })
  }
}
