import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import EmailService from "../services/email.service"

export default async function shipmentNotificationHandler({
  event: { data },
  container,
}: SubscriberArgs<{ fulfillment_id: string; order_id: string }>) {
  try {
    const fulfillmentService = container.resolve<any>("fulfillment")
    const orderService = container.resolve<any>("order")
    const logger = container.resolve("logger")

    const fulfillment = await fulfillmentService.retrieve(data.fulfillment_id)
    const order = await orderService.retrieve(data.order_id, {
      relations: ["customer"],
    })

    if (!order?.customer?.email) return logger.warn("No se encontró email del cliente")

    const emailService = new EmailService({ logger })

    await emailService.sendEmail({
      to: order.customer.email,
      type: "shipment",
      order,
      customer: order.customer,
      data: {
        tracking_number: fulfillment.tracking_numbers?.[0],
        carrier: fulfillment.tracking_links?.[0]?.carrier,
      },
    })

    logger.info(`🚚 Email de envío enviado a ${order.customer.email}`)
  } catch (err: any) {
    container.resolve("logger").error(`Error en shipment-notification: ${err.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.shipment_created",
}
