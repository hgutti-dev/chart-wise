// Prefijo de la familia bcrypt: $2$, $2a$, $2b$, $2y$.
const BCRYPT_PREFIX = /^\$2[aby]?\$/;

// Envuelve un hash bcrypt ya calculado (el hashing lo hace el PasswordHasher en infra).
// Invariante de seguridad (NFR-004): el hash NUNCA viaja al cliente -> `toJSON` lo redacta
// para que un JSON.stringify accidental sobre una sesión/DTO no lo filtre. El acceso
// explícito al valor (persistencia) es por `.value`.
export class PasswordHash {
  private constructor(private readonly _value: string) {}

  // Un valor sin forma bcrypt solo puede venir de storage corrupto o un bug del hasher:
  // es un error INESPERADO, así que lanzamos (no devolvemos Result), igual que la
  // rehidratación de `Note` ante una fila corrupta.
  static fromHash(hash: string): PasswordHash {
    if (!BCRYPT_PREFIX.test(hash)) {
      throw new Error("PasswordHash espera un hash bcrypt ($2*).");
    }
    return new PasswordHash(hash);
  }

  get value(): string {
    return this._value;
  }

  toJSON(): string {
    return "[REDACTED]";
  }

  equals(other: PasswordHash): boolean {
    return this._value === other._value;
  }
}
