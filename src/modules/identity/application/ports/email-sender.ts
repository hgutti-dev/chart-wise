// Puerto de servicio (aplicación): envío del email de verificación. El adaptador real
// (o el fake de consola de la Fase E) construye el enlace `${APP_URL}/verify-email?token=…&email=…`
// a partir de estos datos; el caso de uso no conoce plantillas ni transporte.
export interface SendVerificationParams {
  readonly to: string;
  readonly token: string;
}

export interface EmailSender {
  sendVerification(params: SendVerificationParams): Promise<void>;
}
