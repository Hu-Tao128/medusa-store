import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/utils"
import EmailService from "../services/email.service"

export default async function shipmentNotificationHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string; no_notification?: boolean }>) { // El payload de shipment.created es { id: fulfillment_id }
  const logger = container.resolve("logger")

  try {
    const fulfillmentId = data.id

    // Usar Query.graph para obtener la orden a partir del fulfillment_id.
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    // Empezamos desde la entidad 'fulfillment' y navegamos hacia la 'order'.
    const { data: fulfillments } = await query.graph({
      entity: "fulfillment",
      fields: [
        "id",
        "labels.tracking_number",
        "labels.tracking_url",
        "provider_id",
        "order.id",
        "order.display_id",
        "order.customer.email",
        "order.customer.first_name",
      ],
      // Filtramos por el ID del fulfillment que recibimos en el evento.
      filters: { id: fulfillmentId },
    })

    const fulfillment = fulfillments[0]
    const order = fulfillment?.order

    if (!order?.customer?.email || !fulfillment) {
      logger.warn(`No se encontró la orden o el fulfillment para el evento de envío. FulfillmentId: ${fulfillmentId}`)
      return
    }

    const emailService = new EmailService({ logger })
    await emailService.sendEmail({
      to: order.customer.email,
      type: "shipment",
      order,
      customer: order.customer,
      data: {
        tracking_number: fulfillment.labels?.[0]?.tracking_number,
        carrier: fulfillment.provider_id,
      },
    })

    logger.info(`🚚 Email de envío enviado a ${order.customer.email}`)
  } catch (err: any) {
    logger.error(`Error en shipment-notification: ${err.message}`)
  }
}

export const config: SubscriberConfig = {
  // Este es el evento correcto en Medusa v2 cuando se crea un envío.
  event: "shipment.created",
}
