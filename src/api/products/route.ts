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
        price_set: {
          prices: (variant.price_set?.prices || variant.prices || []).map((p: any) =>
            normalizePriceObject(p)
          ),
        },
        prices: (variant.prices || []).map((p: any) => normalizePriceObject(p))
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
    const { title, description, price, thumbnail, images } = req.body

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

    // 2️⃣ Crear la variante
    const variants = await productService.createProductVariants([
      {
        title: "Default",
        product_id: product.id,
        sku: `SKU-${Date.now()}`,
        manage_inventory: false,
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

    // 5️⃣ Recuperar el producto completo con el query service
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
      ],
      filters: {
        id: product.id,
      },
    })

    res.status(201).json({ 
      success: true,
      product: fullProduct 
    })
    
  } catch (error) {
    console.error("Error creando producto:", error)
    res.status(500).json({ 
      success: false,
      error: "Error al crear producto",
      message: error.message 
    })
  }
}