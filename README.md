# La Cuenta

Aplicación para llevar el crédito y el cobro quincenal de la cocina: registrar lo que cada persona compra, ver cuánto debe y marcar pagos y abonos.

Es una aplicación web instalable (PWA) pensada para usarse en iPad, con letra y botones grandes.

## Tecnología

- React + TypeScript + Vite, Tailwind CSS
- Supabase (PostgreSQL + autenticación)
- Vercel para publicar
- Vitest para pruebas (incluye pruebas del esquema de la base de datos con PGlite)

## Reglas del modelo de datos

- El dinero se guarda en pesos enteros, sin decimales.
- Nada se borra: compras y pagos se anulan, y queda registrado quién y cuándo.
- El saldo es continuo: compras activas menos pagos activos. No hay "quincenas" en la base de datos.
- Cada compra guarda el departamento que tenía la persona en ese momento; si la persona cambia de departamento, la deuda la sigue.
- Los departamentos no son fijos: se crean, se renombran y se archivan desde la app.
- Roles: `admin`, `operador` y `cocina`. La cocina puede registrar, pero no ve saldos ni pagos. Un usuario sin perfil no ve nada.

El esquema está en `supabase/migrations/` y sus pruebas en `supabase/tests/`.

## Voz

El iPad graba el audio y lo envía a `api/transcribir.ts`, una función de Vercel que lo pasa a texto con Groq Whisper (`whisper-large-v3`). Le manda como pista los nombres de departamentos y personas para que los escriba bien. La función solo atiende a usuarias con sesión de Supabase. El texto pasa por el mismo lector de frases que cuando se escribe a mano, y siempre se confirma antes de guardar.

`npm run dev` también atiende las funciones de `api/`, así que en local basta con poner `GROQ_API_KEY` en `.env.local`.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # y llenar con los datos del proyecto de Supabase
npm run dev
npm test
```

## Puesta en marcha (una sola vez)

### 1. Supabase

1. Crear un proyecto en Supabase (región más cercana: São Paulo).
2. Aplicar el esquema:
   ```bash
   npx supabase login
   npx supabase link --project-ref <ref-del-proyecto>
   npx supabase db push
   ```
3. En **Authentication > Sign In / Providers**, desactivar "Allow new users to sign up". Las usuarias se crean a mano.
4. En **Authentication > Users > Add user**, crear las dos usuarias con correo y contraseña (marcando que el correo ya está confirmado). Se entra con un PIN de 4 dígitos, pero Supabase pide mínimo 6 caracteres, así que la contraseña es `cuenta-` seguido del PIN: para el PIN `1234` la contraseña es `cuenta-1234`.
5. En el **SQL Editor**, darles perfil (sin perfil no ven nada):
   ```sql
   insert into public.perfiles (id, nombre, rol)
   select id, 'Mariana', 'admin' from auth.users where email = 'correo-de-mariana';

   insert into public.perfiles (id, nombre, rol)
   select id, 'Abuela', 'operador' from auth.users where email = 'correo-de-la-abuela';
   ```
6. En **Project Settings > API Keys**, copiar la URL del proyecto y la clave publicable (`sb_publishable_...`). Nunca usar la clave secreta en la app.

### 2. Vercel

1. Importar el repositorio de GitHub. Vercel detecta Vite solo.
2. Agregar las variables de entorno `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `VITE_USUARIAS` (por ejemplo `Amparo:correo-de-amparo,Mariana:correo-de-mariana`), y `GROQ_API_KEY` (la clave de console.groq.com; esta no lleva `VITE_` para que nunca llegue a la app).
3. Publicar.

### 3. iPad

1. Abrir la dirección de Vercel en Safari, tocar el nombre y escribir el PIN.
2. Tocar **Compartir > Agregar a pantalla de inicio**.
3. Abrir siempre desde el ícono. La sesión queda guardada y no hay que volver a escribir el PIN.
