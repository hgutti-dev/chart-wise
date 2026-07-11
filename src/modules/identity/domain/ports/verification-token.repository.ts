import type { VerificationToken } from "../entities/verification-token";

// Puerto de persistencia de tokens de verificación. Igual que `UserRepository`, no es
// tenant-scoped (identidad global). `use` es un consumo ATÓMICO: busca por la clave
// compuesta (identifier, token), lo ELIMINA y lo devuelve en una sola operación, evitando
// la carrera de "leer → validar → borrar". Un token de OTRO identifier no matchea la clave
// y devuelve null (SC-008); un token ya usado tampoco vuelve a matchear.
export interface VerificationTokenRepository {
  create(verificationToken: VerificationToken): Promise<void>;

  use(identifier: string, token: string): Promise<VerificationToken | null>;
}
