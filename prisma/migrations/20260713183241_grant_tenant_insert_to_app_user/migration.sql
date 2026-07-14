-- app_user necesita INSERT en "Tenant" para aprovisionar el workspace personal al registrarse
-- (Fase 3: provisión sobre UserRegistered). La migración init solo concedió SELECT. "Tenant" es
-- la raíz del aislamiento y NO está bajo RLS, así que basta el GRANT a nivel de tabla.
GRANT INSERT ON "Tenant" TO app_user;
