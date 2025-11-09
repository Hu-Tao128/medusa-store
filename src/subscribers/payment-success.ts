import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import EmailService from "../services/email.service"

export default async function paymentSuccessHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")

  try {
    const paymentModuleService = container.resolve("payment") as any
    const orderModuleService = container.resolve("order") as any

    // Recuperar el pago capturado
    const payment = await paymentModuleService.retrievePayment(data.id)

    // Obtener la colección de pago asociada
    const collection = await paymentModuleService.retrievePaymentCollection(
      payment.payment_collection_id
    )

    if (!collection?.order_id) {
      logger.warn(
        `⚠️ No se encontró order_id en la colección de pago ${collection?.id}`
      )
      return
    }

    // Recuperar la orden real
    const order = await orderModuleService.retrieveOrder(collection.order_id, {
      relations: ["customer"],
    })

    if (!order?.customer?.email) {
      logger.warn("⚠️ No se encontró email del cliente en la orden.")
      return
    }

    // Enviar correo
    const emailService = new EmailService({ logger })
    await emailService.sendEmail({
      to: order.customer.email,
      type: "payment",
      order,
      customer: order.customer,
      data: { payment_method: payment.provider_id },
    })

    logger.info(`💰 Email de pago enviado a ${order.customer.email}`)
  } catch (err: any) {
    logger.error(`Error en payment-success: ${err.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "payment.captured",
}
