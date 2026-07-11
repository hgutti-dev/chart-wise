import type { PasswordHasher } from "@/modules/identity/application/ports/password-hasher";

// Fake determinista con forma bcrypt ($2b$…). NO usa bcrypt real (eso es la Fase E); solo
// necesita que `hash` produzca un `$2*` estable y distinto del texto plano, y que `compare`
// sea consistente (mismo input → mismo hash) para poder verificar credenciales en los tests.
export class FakePasswordHasher implements PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return `$2b$10$${Buffer.from(plainPassword).toString("base64url")}`;
  }

  async compare(plainPassword: string, passwordHash: string): Promise<boolean> {
    return (await this.hash(plainPassword)) === passwordHash;
  }
}
