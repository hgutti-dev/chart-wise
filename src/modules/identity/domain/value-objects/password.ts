import { err, ok, type Result } from "@/shared/domain/result";

import { WeakPasswordError } from "../errors/weak-password.error";

const MIN_LENGTH = 8;
const MAX_BYTES = 72; // bcrypt trunca a 72 bytes: rechazamos por encima para no dar falsa seguridad.

// Texto plano transitorio: lo consume el PasswordHasher (infra) y se descarta; nunca se
// persiste ni viaja al cliente. `TextEncoder` es un global estándar (Node/Edge) -> sin
// imports de infraestructura, el dominio sigue puro.
export class Password {
  private constructor(private readonly _value: string) {}

  static create(plain: string): Result<Password, WeakPasswordError> {
    if (plain.length < MIN_LENGTH) {
      return err(new WeakPasswordError(`debe tener al menos ${MIN_LENGTH} caracteres`));
    }
    if (new TextEncoder().encode(plain).length > MAX_BYTES) {
      return err(new WeakPasswordError(`no debe superar los ${MAX_BYTES} bytes`));
    }
    return ok(new Password(plain));
  }

  get value(): string {
    return this._value;
  }
}
