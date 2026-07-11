import { describe, expect, it } from "vitest";

import { FakeEmailSender } from "@/modules/identity/infrastructure/email/fake-email-sender";

// Adaptador de producción `FakeEmailSender` (consola/in-memory) — distinto del fake de test:
// es el transporte por defecto del módulo hasta que exista un proveedor real (Resend). Debe
// construir el enlace `${APP_URL}/verify-email?token=…&email=…` (FR-007) y registrar cada
// envío para poder inspeccionarlo. La base URL se inyecta (no importa `env`) para ser puro.
describe("FakeEmailSender (adaptador consola/in-memory)", () => {
  it("registra cada envío de verificación para inspección", async () => {
    const sender = new FakeEmailSender("https://app.test");

    await sender.sendVerification({ to: "user@test.com", token: "tok-123" });

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]).toMatchObject({ to: "user@test.com", token: "tok-123" });
  });

  it("construye el enlace de verificación desde la base URL, escapando token y email", async () => {
    const sender = new FakeEmailSender("https://app.test");

    await sender.sendVerification({ to: "a b@test.com", token: "t o k" });

    expect(sender.sent[0]?.link).toBe(
      "https://app.test/verify-email?token=t%20o%20k&email=a%20b%40test.com",
    );
  });
});
