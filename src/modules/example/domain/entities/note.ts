import type { DomainError } from "@/shared/domain/domain-error";
import { Entity } from "@/shared/domain/entity";
import { isErr, ok, type Result } from "@/shared/domain/result";
import { asTenantId, type TenantId } from "@/shared/domain/tenant-id";

import { NoteTitle } from "../value-objects/note-title";

export type NoteId = string & { readonly __brand: "NoteId" };

export const asNoteId = (value: string): NoteId => value as NoteId;

interface NoteProps {
  readonly id: NoteId;
  readonly tenantId: TenantId;
  readonly title: NoteTitle;
  readonly body: string | null;
  readonly createdAt: Date;
}

export interface CreateNoteProps {
  readonly id: NoteId;
  readonly tenantId: TenantId;
  readonly title: string;
  readonly body?: string | null;
  readonly createdAt: Date;
}

export interface PersistedNoteProps {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly body: string | null;
  readonly createdAt: Date;
}

export class Note extends Entity<NoteId> {
  private constructor(private readonly props: NoteProps) {
    super(props.id);
  }

  static create(props: CreateNoteProps): Result<Note, DomainError> {
    const title = NoteTitle.create(props.title);
    if (isErr(title)) return title;
    return ok(
      new Note({
        id: props.id,
        tenantId: props.tenantId,
        title: title.value,
        body: props.body ?? null,
        createdAt: props.createdAt,
      }),
    );
  }

  // Rehidratación desde persistencia: la fila almacenada ya es válida, así que no
  // devolvemos Result. Un título inválido en la DB es corrupción (error inesperado).
  static fromPersistence(props: PersistedNoteProps): Note {
    const title = NoteTitle.create(props.title);
    if (isErr(title)) {
      throw new Error(`Fila Note corrupta '${props.id}': ${title.error.message}`);
    }
    return new Note({
      id: asNoteId(props.id),
      tenantId: asTenantId(props.tenantId),
      title: title.value,
      body: props.body,
      createdAt: props.createdAt,
    });
  }

  get tenantId(): TenantId {
    return this.props.tenantId;
  }

  get title(): NoteTitle {
    return this.props.title;
  }

  get body(): string | null {
    return this.props.body;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }
}
