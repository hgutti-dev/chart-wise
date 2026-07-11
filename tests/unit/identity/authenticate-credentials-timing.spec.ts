import { describe, expect, it } from "vitest";

import { TIMING_SAFE_DUMMY_HASH } from "@/modules/identity/application/use-cases/authenticate-credentials";
import { BcryptHasher } from "@/modules/identity/infrastructure/crypto/bcrypt-hasher";

// Regresión (NFR-005/006): `AuthenticateCredentials` compara SIEMPRE contra un hash —el real
// si la cuenta existe, o `TIMING_SAFE_DUMMY_HASH` si no— para no filtrar existencia por tiempo.
// `bcrypt.compare` corre al coste embebido en el hash, así que si el dummy tuviera un coste
// distinto al de los hashes reales (BcryptHasher), el camino "sin cuenta" tardaría distinto al
// "con cuenta" y la enumeración se reabriría. Este test fija que ambos costes coincidan.
const bcryptCost = (hash: string): number => Number(hash.split("$")[2]);

describe("constant-time credential check (NFR-006)", () => {
  it("el dummy de tiempo constante tiene el MISMO coste bcrypt que los hashes reales", async () => {
    const realHash = await new BcryptHasher().hash("cualquier-contraseña");
    expect(bcryptCost(TIMING_SAFE_DUMMY_HASH)).toBe(bcryptCost(realHash));
  });
});
