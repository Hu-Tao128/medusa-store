import { type SubscriberArgs, type SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/utils"
import EmailService from "../services/email.service"

export default async function paymentSuccessHandler({
  event: { data },
  container,
}: SubscriberArgs<{ id: string }>) {
  const logger = container.resolve("logger")

  try {
    const paymentId = data.id

    // Usar Query.graph para encontrar la orden a partir del pago.
    // Esta es la forma recomendada y robusta de consultar datos entre módulos.
    const query = container.resolve(ContainerRegistrationKeys.QUERY)

    // Empezamos desde la entidad 'payment' y navegamos hacia arriba hasta la 'order'.
    const { data: payments } = await query.graph({
      entity: "payment",
      fields: [
        "id",
        "provider_id",
        "payment_collection.order.id",
        "payment_collection.order.display_id",
        "payment_collection.order.customer.email",
        "payment_collection.order.customer.first_name",
        "payment_collection.order.items.quantity",
        "payment_collection.order.items.title",
        "payment_collection.order.items.total",
        "payment_collection.order.payment_collections.payments.id",
        "payment_collection.order.payment_collections.payments.provider_id",
        "payment_collection.order.total",
      ],
      // Filtramos por el ID del pago que recibimos en el evento.
      filters: { id: paymentId },
    })

    const order = payments[0]?.payment_collection?.order

    if (!order) {
      logger.error(`❌ No se pudo encontrar una orden asociada al pago ${paymentId} usando Query.graph desde la entidad 'payment'.`);
      return
    }

    // Encontrar el pago específico para obtener el provider_id
    const payment = order.payment_collections
      ?.flatMap(pc => pc?.payments) // Añade optional chaining para manejar pc nulo
      .filter(Boolean) // Filtra cualquier resultado nulo/undefined del flatMap
      .find(p => p.id === paymentId); // Ahora 'p' no puede ser nulo aquí

    if (!order?.customer?.email) {
      logger.warn("⚠️ No se encontró email del cliente en la orden.")
      return
    }

    const emailService = new EmailService({ logger })
    await emailService.sendEmail({
      to: order.customer.email,
      type: "payment",
      order,
      customer: order.customer,
      data: { payment_method: payment?.provider_id || "N/A" },
    })

    logger.info(`💰 Email de pago enviado a ${order.customer.email}`)
  } catch (err: any) {
    logger.error(`Error en payment-success: ${err.message}`)
  }
}

export const config: SubscriberConfig = {
  event: "payment.captured",
}
