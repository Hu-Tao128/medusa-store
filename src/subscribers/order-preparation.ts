import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import EmailService from "../services/email.service"

export default async function orderPreparationHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    const orderService = container.resolve<any>("order")
    const logger = container.resolve("logger")
    const order = await orderService.retrieve(data.id, { relations: ["customer"] })

    if (!order?.customer?.email) {
      logger.warn(`⚠️ No se encontró email del cliente para la orden ${order.id}`)
      return
    }

    const emailService = new EmailService({ logger })

    await emailService.sendEmail({
      to: order.customer.email,
      type: "preparation",
      order,
      customer: order.customer,
    })

    logger.info(`📦 Email de preparación enviado a ${order.customer.email}`)
  } catch (err: any) {
    container.resolve("logger").error(`Error en order-preparation: ${err.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.updated",
}
