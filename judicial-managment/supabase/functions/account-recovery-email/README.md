# Correo de respaldo

Esta función se publica solo después de aplicar las migraciones 3.2.0 y 3.2.1.

Configura estos secretos en Supabase Edge Functions:

- `RESEND_API_KEY`: API key del proveedor transaccional Resend.
- `RECOVERY_EMAIL_FROM`: remitente verificado, por ejemplo `Seguridad Judicial <seguridad@tu-dominio.mx>`.
- `PORTAL_URL`: `https://yzdemnz.github.io/judicial-managment-portal`.

Después de desplegarla, agrega en la compilación del portal:

`VITE_BACKUP_RECOVERY_ENABLED=true`

## Publicacion segura

1. Ejecuta la migracion `20260623151500_secure_account_recovery.sql` en el SQL Editor del proyecto.
2. Configura los secretos y publica `account-recovery-email` como Edge Function.
3. Agrega `https://yzdemnz.github.io/judicial-managment-portal/recuperar` a las URL de redireccion permitidas de Supabase Auth.
4. Cambia el indicador a `true` solo despues de comprobar una cuenta de prueba con 2FA activo.

La funcion limita solicitudes y nunca revela si un correo de respaldo pertenece a una cuenta.

Sin esos secretos, el portal mantiene la opción desactivada y nunca guarda un correo de respaldo sin verificarlo.
