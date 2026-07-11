// Puerto de servicio (aplicación): abstrae el hashing bcrypt. El adaptador real vive en
// `infrastructure/crypto/` (Fase E); el dominio y los casos de uso solo conocen este
// contrato, así que son testeables con un fake sin depender de bcrypt.
export interface PasswordHasher {
  hash(plainPassword: string): Promise<string>;

  // Debe ejecutarse en tiempo constante (NFR-006): `AuthenticateCredentials` lo invoca
  // SIEMPRE, contra un hash dummy si el email no existe, para no filtrar existencia.
  compare(plainPassword: string, passwordHash: string): Promise<boolean>;
}
