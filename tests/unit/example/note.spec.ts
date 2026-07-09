import { describe, expect, it } from "vitest";

import { asNoteId, Note } from "@/modules/example/domain/entities/note";
import { EmptyNoteTitleError } from "@/modules/example/domain/errors";
import { DomainError } from "@/shared/domain/domain-error";
import { isErr, isOk } from "@/shared/domain/result";
import { asTenantId } from "@/shared/domain/tenant-id";

// Test de dominio puro (sin DB, sin Next): la identidad y el reloj se inyectan, así que
// Note.create es una función pura sobre su input. Cubre SC-007 / NFR-005.
const baseProps = () => ({
  id: asNoteId(crypto.randomUUID()),
  tenantId: asTenantId(crypto.randomUUID()),
  createdAt: new Date(),
});

describe("Note.create", () => {
  it("devuelve ok con una nota válida para un título no vacío", () => {
    const result = Note.create({ ...baseProps(), title: "Primera nota", body: "cuerpo" });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return; // narrowing para TS
    expect(result.value.title.value).toBe("Primera nota");
    expect(result.value.body).toBe("cuerpo");
  });

  it("recorta el título antes de validar y persistir", () => {
    const result = Note.create({ ...baseProps(), title: "  con espacios  " });

    expect(isOk(result)).toBe(true);
    if (!isOk(result)) return;
    expect(result.value.title.value).toBe("con espacios");
  });

  it("devuelve un DomainError (EmptyNoteTitleError) para un título vacío", () => {
    const result = Note.create({ ...baseProps(), title: "" });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(EmptyNoteTitleError);
    expect(result.error).toBeInstanceOf(DomainError);
    expect(result.error.code).toBe("example.note-title.empty");
  });

  it("trata un título solo de espacios como vacío", () => {
    const result = Note.create({ ...baseProps(), title: "   " });

    expect(isErr(result)).toBe(true);
    if (!isErr(result)) return;
    expect(result.error).toBeInstanceOf(EmptyNoteTitleError);
  });
});
