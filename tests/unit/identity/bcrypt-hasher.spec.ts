import { describe, expect, it } from "vitest";

import { BcryptHasher } from "@/modules/identity/infrastructure/crypto/bcrypt-hasher";

// Adaptador real del puerto PasswordHasher (Fase E). Se prueba con bcrypt REAL (no mock):
// un hash con forma `$2*`, coste >= 10 y un `compare` que distingue la contraseña correcta
// de la incorrecta. NFR-004/006 quedan cubiertos por el round-trip.
describe("BcryptHasher", () => {
  const hasher = new BcryptHasher();
  const PLAIN = "correct horse battery";

  it("hash produce una cadena bcrypt y nunca el texto plano", async () => {
    const hash = await hasher.hash(PLAIN);
    expect(hash).toMatch(/^\$2[aby]?\$/);
    expect(hash).not.toBe(PLAIN);
  });

  it("usa un coste (rounds) de al menos 10", async () => {
    const hash = await hasher.hash(PLAIN);
    const cost = Number(hash.split("$")[2]);
    expect(cost).toBeGreaterThanOrEqual(10);
  });

  it("compare devuelve true para la contraseña correcta", async () => {
    const hash = await hasher.hash(PLAIN);
    expect(await hasher.compare(PLAIN, hash)).toBe(true);
  });

  it("compare devuelve false para una contraseña incorrecta", async () => {
    const hash = await hasher.hash(PLAIN);
    expect(await hasher.compare("wrong password", hash)).toBe(false);
  });
});
