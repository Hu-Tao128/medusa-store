import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import EmailService, { EmailType } from "../../services/email.service"

type SendEmailBody = {
  to: string
  type: EmailType
  order_id?: string
  customer_id?: string
  tracking_number?: string
  carrier?: string
  payment_method?: string
  custom_data?: Record<string, any>
}

function normalizeMedusaPrices(order: any): any {
  if (!order) return order

  console.log('🔍 DEBUG - Precios antes de normalizar:')
  console.log('Total:', order.total)
  console.log('Subtotal:', order.subtotal)

  // --- 🔧 Función para extraer número puro ---
  const extractNumericValue = (value: any): number => {
    if (!value) return 0
    if (typeof value.toNumber === 'function') return value.toNumber()
    if (typeof value.numeric_ !== 'undefined') return Number(value.numeric_) || 0
    if (typeof value === 'number') return value
    if (typeof value === 'string') return Number(value) || 0
    return 0
  }

  // --- ⚙️ Detección de centavos (fallback) ---
  const maybeInCents = (price: number) => price > 1e6
  const safeConvert = (price: number) => (maybeInCents(price) ? price / 100 : price)

  // --- 💰 Formateador ---
  const formatNumber = (value: number): string => {
    return new Intl.NumberFormat('es-MX', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value)
  }

  // --- 📦 Normaliza y formatea ---
  const normalizeAndFormat = (val: any) => {
    const raw = safeConvert(extractNumericValue(val))
    const formatted = formatNumber(raw)
    return { raw, formatted }
  }

  const totals = {
    total: normalizeAndFormat(order.total),
    subtotal: normalizeAndFormat(order.subtotal),
    tax_total: normalizeAndFormat(order.tax_total),
    shipping_total: normalizeAndFormat(order.shipping_total),
  }

  const items =
    order.items?.map((item: any) => {
      const unit_price = normalizeAndFormat(item.unit_price)
      const subtotal = normalizeAndFormat(item.subtotal)
      const total = normalizeAndFormat(item.total)

      return {
        ...item,
        unit_price_raw: unit_price.raw,
        unit_price_formatted: unit_price.formatted,
        subtotal_raw: subtotal.raw,
        subtotal_formatted: subtotal.formatted,
        total_raw: total.raw,
        total_formatted: total.formatted,
      }
    }) || []

  const normalizedOrder = {
    ...order,
    total_raw: totals.total.raw,
    total_formatted: totals.total.formatted,
    subtotal_raw: totals.subtotal.raw,
    subtotal_formatted: totals.subtotal.formatted,
    tax_total_raw: totals.tax_total.raw,
    tax_total_formatted: totals.tax_total.formatted,
    shipping_total_raw: totals.shipping_total.raw,
    shipping_total_formatted: totals.shipping_total.formatted,
    items,
  }

  console.log('✅ DEBUG - Precios normalizados (formateados incluidos):')
  console.table({
    total_raw: normalizedOrder.total_raw,
    total_formatted: normalizedOrder.total_formatted,
    subtotal_raw: normalizedOrder.subtotal_raw,
    subtotal_formatted: normalizedOrder.subtotal_formatted,
    shipping_total_raw: normalizedOrder.shipping_total_raw,
    shipping_total_formatted: normalizedOrder.shipping_total_formatted,
  })

  return normalizedOrder
}

/**
 * POST /api/sendConfirmation
 * Enviar email transaccional
 */
export async function POST(req: MedusaRequest<SendEmailBody>, res: MedusaResponse) {
  try {
    // Instanciar el servicio directamente sin registerlo en config
    const emailService = new EmailService()
    const query = req.scope.resolve("query")

    const { to, type, order_id, customer_id, tracking_number, carrier, payment_method, custom_data } = req.body

    // Validaciones básicas
    if (!to || !type) {
      return res.status(400).json({
        error: "Datos incompletos",
        message: "Se requieren 'to' (email) y 'type' (confirmation, payment, preparation, shipment)",
      })
    }

    const validTypes: EmailType[] = ["confirmation", "payment", "preparation", "shipment"]
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        error: "Tipo de email inválido",
        message: `type debe ser uno de: ${validTypes.join(", ")}`,
      })
    }

    let order: any = null
    let customer: any = null

    // Obtener datos de la orden si se proporciona order_id
    if (order_id) {
      try {
        const { data: orders } = await query.graph({
          entity: "order",
          fields: [
            "id",
            "display_id",
            "customer_id",
            "total",
            "subtotal",
            "tax_total",
            "shipping_total",
            "status",
            "created_at",
            "items.*",
            "items.title",
            "items.quantity",
            "items.unit_price",
            "customer.*",
            "shipping_address.*",
          ],
          filters: { id: order_id },
        })

        order = orders?.[0] || null

        if (!order) {
          return res.status(404).json({
            error: "Orden no encontrada",
            message: `No se encontró orden con ID: ${order_id}`,
          })
        }

        // NORMALIZAR PRECIOS DE LA ORDEN - clave aquí
        order = normalizeMedusaPrices(order)

        // Si no se especificó customer_id, usar el de la orden
        if (!customer_id && order?.customer_id) {
          customer = order?.customer || null
        }
      } catch (error: any) {
        console.error("Error obteniendo orden:", error)
        return res.status(500).json({
          error: "Error obteniendo datos de la orden",
          message: error.message,
        })
      }
    }

    // Obtener datos del cliente si se proporciona customer_id
    if (customer_id && !customer) {
      try {
        const { data: customers } = await query.graph({
          entity: "customer",
          fields: ["id", "first_name", "last_name", "email", "phone"],
          filters: { id: customer_id },
        })

        customer = customers?.[0] || null

        if (!customer) {
          return res.status(404).json({
            error: "Cliente no encontrado",
            message: `No se encontró cliente con ID: ${customer_id}`,
          })
        }
      } catch (error: any) {
        console.error("Error obteniendo cliente:", error)
        return res.status(500).json({
          error: "Error obteniendo datos del cliente",
          message: error.message,
        })
      }
    }

    // Validar que tenemos un email destinatario
    if (!to && !customer?.email) {
      return res.status(400).json({
        error: "Email requerido",
        message: "Se requiere 'to' o un cliente con email",
      })
    }

    const recipientEmail = to || customer?.email

    // Preparar datos para el email
    const emailPayload = {
      to: recipientEmail,
      type,
      order, // Ya con precios normalizados
      customer,
      data: {
        tracking_number,
        carrier,
        payment_method,
        ...custom_data,
      },
    }

    // Enviar email
    const result = await emailService.sendEmail(emailPayload)

    if (!result.success) {
      return res.status(500).json({
        error: "Error enviando email",
        message: result.message,
      })
    }

    return res.status(200).json({
      success: true,
      message: result.message,
      email_sent_to: recipientEmail,
      type,
      order_id,
    })
  } catch (error: any) {
    console.error("Error en POST /sendConfirmation:", error)
    return res.status(500).json({
      error: "Error interno",
      message: error.message,
    })
  }
}

/**
 * GET /api/sendConfirmation/verify
 * Verificar que la conexión SMTP está funcionando
 */
export async function GET(req: MedusaRequest, res: MedusaResponse) {
  try {
    // Instanciar el servicio directamente
    const emailService = new EmailService()

    const isConnected = await emailService.verifyConnection()

    if (isConnected) {
      return res.status(200).json({
        success: true,
        message: "Conexión SMTP verificada exitosamente",
      })
    } else {
      return res.status(500).json({
        success: false,
        message: "Error verificando conexión SMTP. Revisa tus credenciales.",
      })
    }
  } catch (error: any) {
    console.error("Error verificando SMTP:", error)
    return res.status(500).json({
      success: false,
      message: error.message,
    })
  }
}