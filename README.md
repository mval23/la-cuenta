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

## Entrada

La cuenta de Supabase de cada usuaria tiene una contraseña larga que solo se escribe al configurar un dispositivo. Después la sesión queda guardada y la app se abre con un PIN de 4 números que vive solo en ese dispositivo (`src/lib/candado.ts`). Desde otro lado el PIN no sirve, así que para adivinarlo hay que tener el iPad en la mano.

- El PIN se pide al abrir la app si pasaron más de 30 minutos sin usarla.
- No se aceptan PIN fáciles como 1111 o 1234.
- Tras 5 fallos seguidos hay que esperar un minuto. Tras 10 se cierra la sesión y hay que configurar el dispositivo otra vez.
- Si se olvida el PIN, o para cambiarlo: **Ajustes > Cerrar sesión** y configurar el dispositivo otra vez.

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
4. En **Authentication > Users > Add user**, crear las dos usuarias con correo y contraseña (marcando que el correo ya está confirmado). La contraseña debe ser larga y al azar (por ejemplo, 20 caracteres del gestor de contraseñas) y se guarda en el gestor de Mariana: solo se escribe al configurar cada dispositivo. El PIN de 4 números del día a día no es la contraseña de la cuenta (ver **Entrada**).
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
2. Agregar las variables de entorno `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` y `GROQ_API_KEY` (la clave de console.groq.com; esta no lleva `VITE_` para que nunca llegue a la app).
3. Publicar.

### 3. iPad

1. Abrir la dirección de Vercel en Safari y tocar **Compartir > Agregar a pantalla de inicio**.
2. Abrir La Cuenta desde el ícono. Mariana escribe el correo y la contraseña larga de la usuaria (una sola vez).
3. La usuaria elige su PIN de 4 números y lo escribe otra vez.
4. Abrir siempre desde el ícono: la sesión queda guardada ahí, no en Safari.

### 4. Respaldo diario

`.github/workflows/respaldo.yml` corre todos los días a las 3:00 a. m. (hora de Colombia) y guarda un respaldo por 90 días en la pestaña **Actions** del repositorio. Si falla, GitHub envía un correo.

1. En Supabase, botón **Connect** arriba, copiar la cadena de **Session pooler** (los servidores de GitHub no llegan a la conexión directa). Se ve así: `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:5432/postgres`. Cambiar `[YOUR-PASSWORD]` por la contraseña de la base de datos.
2. En GitHub, **Settings > Secrets and variables > Actions > New repository secret**: nombre `SUPABASE_DB_URL`, valor la cadena del paso anterior.
3. En **Actions > Respaldo diario > Run workflow**, correrlo una vez para confirmar que funciona.

Cada respaldo trae:

- `la-cuenta.dump`: la base completa (esquema `public`).
- `usuarias.dump`: las cuentas de entrada (`auth.users`), con sus contraseñas cifradas.
- `csv/`: cada tabla en CSV, más `saldos.csv` con lo que debe cada persona. Se abren en Excel.

Para restaurar se usa `scripts/restaurar.sh`, que necesita `psql` y `pg_restore` versión 17. Primero se descarga el respaldo del día que se quiere desde la pestaña **Actions** (ejecución de **Respaldo diario**) y se descomprime.

El esquema no sale del respaldo sino de las migraciones, porque ellas traen los permisos (por ejemplo, que las compras no se puedan editar ni borrar); el respaldo no los guarda. El script carga solo los datos, en una sola transacción: si algo falla, la base queda como estaba.

En el mismo proyecto, si se dañaron datos (cambia lo que haya en las tablas de la app por lo del respaldo; las usuarias no se tocan):

```bash
scripts/restaurar.sh "<cadena-de-conexión>" la-cuenta-AAAA-MM-DD --reemplazar
```

En un proyecto nuevo de Supabase, primero el esquema y después los datos. El script trae también las usuarias, con sus contraseñas:

```bash
npx supabase link --project-ref <ref-del-proyecto-nuevo>
npx supabase db push
scripts/restaurar.sh "<cadena-de-conexión>" la-cuenta-AAAA-MM-DD
```

Después hay que cambiar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en Vercel y configurar los dispositivos otra vez.

### 5. Ensayo de restauración

`.github/workflows/ensayo-restauracion.yml` corre el día 1 de cada mes, y también cuando cambian las migraciones o los scripts. Toma el último respaldo, lo restaura con `scripts/restaurar.sh` en un Supabase nuevo dentro de GitHub y revisa con `scripts/verificar-restauracion.sh` que cada tabla quede igual fila por fila, que los saldos coincidan y que la app pueda seguir anotando sin poder cambiar valores ni borrar. Después repite la restauración encima, como en el mismo proyecto. Si falla, GitHub envía un correo. Los registros solo muestran conteos, nunca nombres ni valores.
