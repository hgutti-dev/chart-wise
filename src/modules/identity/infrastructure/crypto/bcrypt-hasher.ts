import bcrypt from "bcryptjs";

import type { PasswordHasher } from "../../application/ports/password-hasher";

// Coste bcrypt. 12 está dentro del rango recomendado (>= 10-12, R3) y mantiene el `compare`
// en tiempo constante razonable. El coste queda embebido en el propio hash (`$2b$12$…`).
const SALT_ROUNDS = 12;

// Adaptador real del puerto `PasswordHasher` con bcryptjs (JS puro, portable a Windows/CI;
// R3). El hashing corre SOLO en Node (nunca Edge). `compare` es intrínsecamente de tiempo
// constante para un hash dado; `AuthenticateCredentials` lo invoca siempre —contra un hash
// dummy si el email no existe— para no filtrar existencia (NFR-006).
export class BcryptHasher implements PasswordHasher {
  async hash(plainPassword: string): Promise<string> {
    return bcrypt.hash(plainPassword, SALT_ROUNDS);
  }

  async compare(plainPassword: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(plainPassword, passwordHash);
  }
}
