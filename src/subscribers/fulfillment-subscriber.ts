import type { SubscriberConfig, SubscriberArgs } from "@medusajs/framework"
import EmailService from "../services/email.service"

export default async function fulfillmentSubscriber({
  event,
  data,
  container,
}: SubscriberArgs) {
  const logger = container.resolve("logger")
  const query = container.resolve("query")

  try {
    const emailService = new EmailService()

    // 🔍 Obtenemos el fulfillment recién creado
    const { id: fulfillmentId, order_id } = data

    // Extraemos datos de la orden asociada
    const { data: orders } = await query.graph({
      entity: "order",
      fields: [
        "id",
        "display_id",
        "customer_id",
        "shipping_address.*",
        "items.*",
        "total",
        "subtotal",
        "shipping_total",
        "tax_total",
        "status",
        "customer.email",
        "customer.first_name",
        "customer.last_name"
      ],
      filters: { id: order_id },
    })

    const order = orders?.[0]
    if (!order) {
      logger.warn(`⚠️ No se encontró la orden ${order_id} asociada al fulfillment ${fulfillmentId}`)
      return
    }

    // 🔔 Enviar correo (usamos tu endpoint interno)
    const result = await emailService.sendEmail({
      to: order.customer.email,
      type: "shipment", // tipo definido en tu EmailService
      order,
      customer: order.customer,
      data: {
        fulfillment_id: fulfillmentId,
        message: "Tu pedido ha sido preparado y pronto será enviado 🚚",
      },
    })

    if (result.success) {
      logger.info(`📨 Email de fulfillment enviado a ${order.customer.email}`)
    } else {
      logger.error(`❌ Error enviando email: ${result.message}`)
    }

  } catch (err: any) {
    logger.error(`Error en fulfillmentSubscriber: ${err.message}`)
  }
}

export const config: SubscriberConfig = {
  event: [
    "fulfillment.created", // cuando se genera el envío
    // puedes agregar también:
    // "fulfillment.shipped"
  ],
}
