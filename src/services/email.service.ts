import nodemailer from 'nodemailer'
import { Logger } from '@medusajs/medusa'

export type EmailType = 'confirmation' | 'payment' | 'preparation' | 'shipment'

export interface EmailPayload {
  to: string
  type: EmailType
  order?: any
  customer?: any
  data?: Record<string, any>
}

// Templates HTML para cada tipo de email
const emailTemplates = {
  confirmation: (data: any) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
          .header { background: #007bff; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { padding: 20px; }
          .footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666; }
          .order-number { font-size: 18px; font-weight: bold; color: #007bff; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Pedido Confirmado</h1>
          </div>
          <div class="content">
            <p>¡Hola ${data.customer?.first_name || 'Cliente'}!</p>
            <p>Tu pedido ha sido confirmado exitosamente.</p>
            <p class="order-number">Número de Pedido: #${data.order?.display_id || 'N/A'}</p>
            <p><strong>Total:</strong> $${(data.order?.total / 100).toFixed(2)} MXN</p>
            <p><strong>Items:</strong> ${data.order?.items?.length || 0} productos</p>
            <p>Recibirás actualizaciones sobre el estado de tu pedido por correo electrónico.</p>
            <p>Gracias por tu compra.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Mi Tienda. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
    </html>
  `,

  payment: (data: any) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
          .header { background: #28a745; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { padding: 20px; }
          .footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666; }
          .status { color: #28a745; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>✓ Pago Recibido</h1>
          </div>
          <div class="content">
            <p>¡Hola ${data.customer?.first_name || 'Cliente'}!</p>
            <p>Tu pago ha sido procesado exitosamente.</p>
            <p><strong>Número de Pedido:</strong> #${data.order?.display_id || 'N/A'}</p>
            <p><strong>Monto Pagado:</strong> <span class="status">$${(data.order?.total / 100).toFixed(2)} MXN</span></p>
            <p><strong>Método de Pago:</strong> ${data.payment_method || 'N/A'}</p>
            <p>Tu pedido está siendo preparado para envío.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Mi Tienda. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
    </html>
  `,

  preparation: (data: any) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
          .header { background: #ff9800; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { padding: 20px; }
          .footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📦 Preparando Tu Pedido</h1>
          </div>
          <div class="content">
            <p>¡Hola ${data.customer?.first_name || 'Cliente'}!</p>
            <p>Tu pedido está siendo preparado en nuestro almacén.</p>
            <p><strong>Número de Pedido:</strong> #${data.order?.display_id || 'N/A'}</p>
            <p>Pronto recibirás información de envío.</p>
            <p>Gracias por tu paciencia.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Mi Tienda. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
    </html>
  `,

  shipment: (data: any) => `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 5px; }
          .header { background: #17a2b8; color: white; padding: 20px; text-align: center; border-radius: 5px 5px 0 0; }
          .content { padding: 20px; }
          .footer { background: #f5f5f5; padding: 15px; text-align: center; font-size: 12px; color: #666; }
          .tracking { background: #e7f3ff; padding: 15px; border-left: 4px solid #17a2b8; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🚚 Tu Pedido Está En Camino</h1>
          </div>
          <div class="content">
            <p>¡Hola ${data.customer?.first_name || 'Cliente'}!</p>
            <p>Tu pedido ha sido enviado.</p>
            <p><strong>Número de Pedido:</strong> #${data.order?.display_id || 'N/A'}</p>
            ${data.tracking_number ? `
              <div class="tracking">
                <p><strong>Número de Seguimiento:</strong> ${data.tracking_number}</p>
                <p><strong>Transportista:</strong> ${data.carrier || 'N/A'}</p>
              </div>
            ` : ''}
            <p>Estará contigo pronto. Puedes rastrear tu envío con el número de seguimiento anterior.</p>
          </div>
          <div class="footer">
            <p>&copy; 2024 Mi Tienda. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
    </html>
  `,
}

class EmailService {
  private logger: Logger
  private transporter: any

  constructor({ logger }: { logger?: Logger } = {}) {
    this.logger = logger || console as any

    // Validar credenciales
    if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
      this.logger.error('⚠️ Variables de email no configuradas. Revisa tu .env')
    }

    // Configurar transporter de Nodemailer
    this.transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: parseInt(process.env.EMAIL_PORT || '587'),
      secure: process.env.EMAIL_PORT === '465', // true para puerto 465, false para otros
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    })

    this.logger.info('📧 EmailService inicializado')
  }

  /**
   * Enviar email transaccional
   */
  async sendEmail(payload: EmailPayload): Promise<{ success: boolean; message?: string }> {
    try {
      const { to, type, order, customer, data = {} } = payload

      if (!to) {
        this.logger.error('Email sin destinatario')
        return { success: false, message: 'Destinatario requerido' }
      }

      if (!emailTemplates[type]) {
        this.logger.error(`Tipo de email desconocido: ${type}`)
        return { success: false, message: 'Tipo de email no válido' }
      }

      // Generar HTML del template
      const htmlContent = emailTemplates[type]({
        customer,
        order,
        ...data,
      })

      // Mapeo de asuntos según tipo
      const subjectMap: Record<EmailType, string> = {
        confirmation: 'Pedido Confirmado',
        payment: 'Pago Recibido',
        preparation: 'Tu Pedido Está Siendo Preparado',
        shipment: 'Tu Pedido Está En Camino',
      }

      // Enviar email
      const info = await this.transporter.sendMail({
        from: `${process.env.EMAIL_FROM_NAME || 'Mi Tienda'} <${process.env.EMAIL_FROM}>`,
        to,
        subject: subjectMap[type],
        html: htmlContent,
        text: `${subjectMap[type]} - Pedido #${order?.display_id || 'N/A'}`,
      })

      this.logger.info(`Email ${type} enviado a ${to} - Message ID: ${info.messageId}`)

      return { success: true, message: `Email ${type} enviado exitosamente` }
    } catch (error: any) {
      this.logger.error(`Error enviando email ${payload.type}: ${error.message}`)
      return { success: false, message: error.message }
    }
  }

  /**
   * Enviar email personalizado
   */
  async sendCustomEmail(to: string, subject: string, htmlContent: string): Promise<{ success: boolean; message?: string }> {
    try {
      const info = await this.transporter.sendMail({
        from: `${process.env.EMAIL_FROM_NAME || 'Mi Tienda'} <${process.env.EMAIL_FROM}>`,
        to,
        subject,
        html: htmlContent,
      })

      this.logger.info(`Email personalizado enviado a ${to} - Message ID: ${info.messageId}`)
      return { success: true, message: 'Email enviado exitosamente' }
    } catch (error: any) {
      this.logger.error(`Error enviando email personalizado: ${error.message}`)
      return { success: false, message: error.message }
    }
  }

  /**
   * Verificar conexión SMTP
   */
  async verifyConnection(): Promise<boolean> {
    try {
      await this.transporter.verify()
      this.logger.info('Conexión SMTP verificada exitosamente')
      return true
    } catch (error: any) {
      this.logger.error(`Error verificando conexión SMTP: ${error.message}`)
      return false
    }
  }
}

export default EmailService