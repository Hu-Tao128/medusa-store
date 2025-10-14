import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import type { IProductModuleService, IPricingModuleService } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"

function normalizePriceObject(price: any) {
  const original = typeof price?.amount === "number" ? price.amount : Number(price?.amount ?? 0)

  let amount_cents: number
  let amount_units: number

  if (Number.isInteger(original) && original > 1000) {
    
    amount_cents = original
    amount_units = +(original / 100).toFixed(2)
  } else {

    amount_cents = Math.round(original * 100)
    amount_units = +(amount_cents / 100).toFixed(2)
  }

  return {
    ...price,
    amount_raw: original,      
    amount_cents,              
    amount_units,              
    amount: amount_cents,      
  }
}

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const query = req.scope.resolve("query")

  try {
    // Obtener productos con variantes, precios e inventario (location_levels)
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
        // campos añadidos para inventario
        "variants.inventory_items.*",
        "variants.inventory_items.inventory.*",
        "variants.inventory_items.inventory.location_levels.*",
        "categories.*",
      ],
      filters: {
        status: ["published"],
      },
    })

    // helper para extraer cantidad desde un location_level u otros campos comunes
    const qtyFromLevelValue = (lvl: any) =>
      Number(lvl?.stocked_quantity ?? lvl?.quantity ?? lvl?.available ?? lvl?.available_quantity ?? lvl?.qty ?? 0)

    // Formatear la respuesta para que sea más fácil de usar en el frontend
    const formattedProducts = products.map(product => ({
      ...product,
      variants: product.variants?.map((variant: any) => {
        // normalizar inventory_items -> extraer location_levels y calcular total por inventory_item
        const inventory_items = (variant.inventory_items || []).map((pv: any) => {
          const inv = pv.inventory || {}

          // location_levels puede venir en inventory.location_levels o directamente en pv.location_levels
          const location_levels = inv.location_levels || pv.location_levels || []

          const total_by_item = (location_levels || []).reduce((sum: number, lvl: any) => {
            return sum + qtyFromLevelValue(lvl)
          }, 0)

          // fallback: si inventory tiene un campo directo de cantidad
          const fallbackQty = Number(inv?.quantity ?? pv?.quantity ?? 0)

          return {
            ...pv,
            inventory: {
              ...inv,
              location_levels: location_levels,
            },
            total_quantity: total_by_item || fallbackQty,
          }
        })

        const total_variant_quantity = inventory_items.reduce((s: number, it: any) => s + Number(it.total_quantity || 0), 0)

        const in_stock = total_variant_quantity > 0

        return {
          ...variant,
          price_set: {
            prices: (variant.price_set?.prices || variant.prices || []).map((p: any) =>
              normalizePriceObject(p)
            ),
          },
          prices: (variant.prices || []).map((p: any) => normalizePriceObject(p)),
          inventory_items,
          total_quantity: total_variant_quantity,
          // bandera que el front puede usar para mostrar gris/inactivo
          is_active: in_stock,
          in_stock,
        }
      })
    }))

    res.json({
      products: formattedProducts,
      count: formattedProducts.length,
    })
  } catch (error: any) {
    console.error("Error fetching products:", error)
    res.status(500).json({ 
      error: "Error al obtener productos",
      message: error.message ?? String(error)
    })
  }
}

type CreateProductBody = {
  title: string
  description: string
  price: number
  thumbnail?: string
  images?: string[]
}

export async function POST(req: MedusaRequest<CreateProductBody>, res: MedusaResponse) {
  const productService = req.scope.resolve(Modules.PRODUCT) as IProductModuleService
  const pricingService = req.scope.resolve(Modules.PRICING) as IPricingModuleService

  try {
    const { title, description, price, thumbnail, images, quantity } = req.body as CreateProductBody & { quantity?: number }

    if (!title || !price) {
      return res.status(400).json({
        error: "Datos incompletos",
        message: "El título y precio son requeridos"
      })
    }

    // Generar handle único agregando timestamp
    const baseHandle = title.toLowerCase().replace(/\s+/g, "-")
    const uniqueHandle = `${baseHandle}-${Date.now()}`

    // 1️⃣ Crear el producto base
    const products = await productService.createProducts([
      {
        title,
        description: description || "",
        handle: uniqueHandle,
        status: "published",
        thumbnail: thumbnail || "",
        images: images ? images.map(url => ({ url })) : [],
      }
    ])

    const product = products[0]

    // 2️⃣ Crear la variante (activar manejo de inventario si se envió quantity)
    const variants = await productService.createProductVariants([
      {
        title: "Default",
        product_id: product.id,
        sku: `SKU-${Date.now()}`,
        manage_inventory: Boolean(quantity && quantity > 0),
      }
    ])

    const variant = variants[0]

    // 3️⃣ Crear el price set para la variante
    const priceSet = await pricingService.createPriceSets({
      prices: [
        {
          amount: Math.round(price * 100),
          currency_code: "mxn",
        }
      ]
    })

    // 4️⃣ Vincular el price set con la variante usando Remote Link
    const remoteLink = req.scope.resolve("remoteLink")
    await remoteLink.create({
      [Modules.PRODUCT]: {
        variant_id: variant.id,
      },
      [Modules.PRICING]: {
        price_set_id: priceSet.id,
      },
    })

    // 5️⃣ Si se pidió stock inicial, intentar crear inventory item y location level
    const qty = Number(quantity ?? 0)
    if (qty > 0) {
      try {
        // resolver servicios con try/catch para evitar AwilixResolutionError si no existen
        let inventoryService: any = null
        let locationService: any = null
        try {
          inventoryService = req.scope.resolve("inventoryService")
        } catch (e) {
          inventoryService = null
        }
        try {
          locationService = req.scope.resolve("locationService")
        } catch (e) {
          locationService = null
        }

        // crear inventory_item si el servicio lo soporta
        let invItem: any = null
        if (inventoryService && typeof inventoryService.createInventoryItem === "function") {
          invItem = await inventoryService.createInventoryItem({
            sku: variant.sku || `SKU-${Date.now()}`,
            title: variant.title || product.title,
            variant_id: variant.id,
          })
        } else {
          console.warn("inventoryService.createInventoryItem no disponible en este entorno Medusa")
        }

        // obtener primera location disponible
        let locationId: string | undefined
        if (locationService) {
          if (typeof locationService.list === "function") {
            const locations = await locationService.list?.({})
            locationId = locations?.[0]?.id
          } else if (typeof locationService.retrieve === "function") {
            const loc = await locationService.retrieve?.()
            locationId = loc?.id
          }
        }

        // crear location level (stock) si el método existe
        if (invItem && inventoryService && typeof inventoryService.createLocationLevel === "function" && locationId) {
          await inventoryService.createLocationLevel({
            inventory_item_id: invItem.id,
            location_id: locationId,
            stocked_quantity: qty,
          })
        } else if (invItem && inventoryService && typeof inventoryService.setInventoryItemQuantity === "function") {
          // fallback a otros nombres de API
          await inventoryService.setInventoryItemQuantity(invItem.id, qty)
        } else {
          console.warn("No se pudo crear stock automáticamente (metodos de inventory/locations no disponibles).")
        }
      } catch (invErr) {
        console.warn("Error al crear inventario inicial:", invErr)
      }
    }

    // 6️⃣ Recuperar el producto completo con el query service
    const query = req.scope.resolve("query")
    const { data: [fullProduct] } = await query.graph({
      entity: "product",
      fields: [
        "id",
        "title",
        "handle",
        "description",
        "thumbnail",
        "status",
        "created_at",
        "images.*",
        "variants.*",
        "variants.prices.*",
        // incluir campos de inventario para que el front vea cantidades
        "variants.inventory_items.*",
        "variants.inventory_items.inventory.*",
        "variants.inventory_items.inventory.location_levels.*",
      ],
      filters: {
        id: product.id,
      },
    })

    res.status(201).json({ 
      success: true,
      product: fullProduct 
    })
    
  } catch (error: any) {
    console.error("Error creando producto:", error)
    res.status(500).json({ 
      success: false,
      error: "Error al crear producto",
      message: error.message ?? String(error)
    })
  }
}