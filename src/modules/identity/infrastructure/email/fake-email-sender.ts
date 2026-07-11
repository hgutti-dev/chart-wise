import type {
  EmailSender,
  SendVerificationParams,
} from "../../application/ports/email-sender";

export interface SentVerification {
  readonly to: string;
  readonly token: string;
  readonly link: string;
}

// Adaptador de producción por defecto del puerto `EmailSender` hasta que haya un proveedor
// real (Resend se difiere, R5). Construye el enlace de verificación (FR-007) a partir de la
// base URL inyectada —no importa `env`, así se mantiene puro y testeable— lo escribe por
// consola (para poder abrirlo en desarrollo) y lo registra en `sent` para inspección.
export class FakeEmailSender implements EmailSender {
  readonly sent: SentVerification[] = [];

  constructor(private readonly appUrl: string) {}

  async sendVerification({ to, token }: SendVerificationParams): Promise<void> {
    const link = `${this.appUrl}/verify-email?token=${encodeURIComponent(
      token,
    )}&email=${encodeURIComponent(to)}`;

    this.sent.push({ to, token, link });
    // Transporte de desarrollo: el "envío" es imprimir el enlace verificable.
    console.info(`[email:fake] enlace de verificación para ${to}: ${link}`);
  }
}
