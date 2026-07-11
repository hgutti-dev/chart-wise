import type { VerificationToken } from "../../domain/entities/verification-token";
import type { VerificationTokenRepository } from "../../domain/ports/verification-token.repository";

// Fake para tests. Indexa por la clave compuesta (identifier, token), igual que el
// `@@unique([identifier, token])` de la tabla. `use` es atomico: encuentra, borra y
// devuelve. La clave se serializa con JSON.stringify del par, que es libre de colisiones
// (el escapado JSON separa ambos campos sin depender de un separador reservado).
export class InMemoryVerificationTokenRepository
  implements VerificationTokenRepository
{
  private readonly tokensByKey = new Map<string, VerificationToken>();

  async create(verificationToken: VerificationToken): Promise<void> {
    this.tokensByKey.set(
      this.keyOf(verificationToken.identifier, verificationToken.token),
      verificationToken,
    );
  }

  async use(
    identifier: string,
    token: string,
  ): Promise<VerificationToken | null> {
    const key = this.keyOf(identifier, token);
    const found = this.tokensByKey.get(key) ?? null;
    if (found !== null) {
      this.tokensByKey.delete(key);
    }
    return found;
  }

  private keyOf(identifier: string, token: string): string {
    return JSON.stringify([identifier, token]);
  }
}
