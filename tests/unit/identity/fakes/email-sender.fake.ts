import type {
  EmailSender,
  SendVerificationParams,
} from "@/modules/identity/application/ports/email-sender";

// Fake que registra cada envío para que el test pueda aseverar el flujo de verificación
// (SC-008) sin transporte real de email.
export class FakeEmailSender implements EmailSender {
  readonly sent: SendVerificationParams[] = [];

  async sendVerification(params: SendVerificationParams): Promise<void> {
    this.sent.push(params);
  }
}
