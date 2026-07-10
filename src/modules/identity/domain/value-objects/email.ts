import { err, ok, type Result } from "@/shared/domain/result";

import { InvalidEmailError } from "../errors/invalid-email.error";

// Validación pragmática de forma (no RFC 5322 completo, YAGNI): un local, una @, un
// dominio con al menos un punto, sin espacios. Suficiente para el boundary del dominio;
// la verificación real de existencia es el flujo de email (VerifyEmail).
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class Email {
  private constructor(private readonly _value: string) {}

  static create(raw: string): Result<Email, InvalidEmailError> {
    const normalized = raw.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(normalized)) {
      return err(new InvalidEmailError());
    }
    return ok(new Email(normalized));
  }

  get value(): string {
    return this._value;
  }

  equals(other: Email): boolean {
    return this._value === other._value;
  }
}
