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
      order,
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