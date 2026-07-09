// Vitest no puebla process.env con variables sin prefijo VITE_. Los tests de integración
// necesitan DATABASE_URL (rol app_user, NOBYPASSRLS) para conectar a Postgres, así que
// cargamos `.env` una vez antes de correr. dotenv no pisa lo ya definido (p. ej. NODE_ENV
// que Vitest fija a "test").
import "dotenv/config";
