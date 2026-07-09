export abstract class Entity<Id> {
  protected constructor(readonly id: Id) {}

  equals(other?: Entity<Id>): boolean {
    if (other === undefined) return false;
    if (this === other) return true;
    return this.id === other.id;
  }
}
