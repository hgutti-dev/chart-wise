import type { PrismaClient } from "@/generated/prisma/client";

import { VerificationToken } from "../../domain/entities/verification-token";
import type { VerificationTokenRepository } from "../../domain/ports/verification-token.repository";

// P2025 = "An operation failed because it depends on one or more records that were required
// but not found" (registro a borrar inexistente). Se detecta por `code` sin acoplarse a la
// clase de error del cliente generado.
const isRecordNotFound = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  (error as { code: unknown }).code === "P2025";

// Repositorio real de tokens de verificación. NO es tenant-scoped (identidad global).
export class PrismaVerificationTokenRepository
  implements VerificationTokenRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async create(verificationToken: VerificationToken): Promise<void> {
    await this.prisma.verificationToken.create({
      data: {
        identifier: verificationToken.identifier,
        token: verificationToken.token,
        expires: verificationToken.expires,
      },
    });
  }

  // Consumo ATÓMICO: `delete` por la clave compuesta (identifier, token) devuelve la fila
  // borrada, o lanza P2025 si no existe —token inexistente, ya usado o de OTRO identifier
  // (SC-008)— que traducimos a `null`. Una sola operación: sin carrera leer→validar→borrar.
  async use(identifier: string, token: string): Promise<VerificationToken | null> {
    try {
      const row = await this.prisma.verificationToken.delete({
        where: { identifier_token: { identifier, token } },
      });
      return VerificationToken.issue({
        identifier: row.identifier,
        token: row.token,
        expires: row.expires,
      });
    } catch (error) {
      if (isRecordNotFound(error)) return null;
      throw error;
    }
  }
}
