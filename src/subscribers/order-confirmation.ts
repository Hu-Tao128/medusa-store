import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import EmailService from "../services/email.service"

export default async function orderConfirmationHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  try {
    const orderService = container.resolve("order")
    const logger = container.resolve("logger")

    const order = await orderService.retrieve(data.id, {
      relations: ["customer", "items"],
    })

    if (!order?.customer?.email) return logger.warn("No se encontró email del cliente")

    const emailService = new EmailService({ logger })

    await emailService.sendEmail({
      to: order.customer.email,
      type: "confirmation",
      order,
      customer: order.customer,
    })

    logger.info(`📧 Email de confirmación enviado a ${order.customer.email}`)
  } catch (err: any) {
    container.resolve("logger").error(`Error en order-confirmation: ${err.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "order.placed",
}
