// Token de verificación de email. Forma estándar del adapter de Auth.js: clave compuesta
// (identifier, token) SIN id propio. `identifier` es el email a verificar; `token` es el
// secreto de un solo uso; `expires` marca la caducidad. El valor del token y la expiración
// se INYECTAN desde la aplicación (igual que id/createdAt en otras entidades) para que el
// dominio siga siendo puro y determinista.
interface VerificationTokenProps {
  readonly identifier: string;
  readonly token: string;
  readonly expires: Date;
}

export class VerificationToken {
  private constructor(private readonly props: VerificationTokenProps) {}

  static issue(props: VerificationTokenProps): VerificationToken {
    return new VerificationToken(props);
  }

  // Un token caduca en su instante `expires` (inclusive): en ese momento ya no es válido.
  isExpired(now: Date): boolean {
    return this.props.expires.getTime() <= now.getTime();
  }

  get identifier(): string {
    return this.props.identifier;
  }

  get token(): string {
    return this.props.token;
  }

  get expires(): Date {
    return this.props.expires;
  }
}
