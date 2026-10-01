# Prueba de La Cuenta con Amparo

Guía para ver, en el iPad real y en la cocina, si Amparo puede usar la app sola.

Amparo ya usa La Cuenta con los datos reales de la cocina. Por eso la prueba es
**observarla mientras trabaja**, no pedirle tareas inventadas: todo lo que se anota
cuenta en Cobrar, en los PDF y en lo que reconoce el dictado.

## Reglas

- **No inventar nada.** Ni compras, ni pagos, ni personas, ni departamentos "de
  prueba". Solo se observa lo que pasa de verdad.
- Si algo se anota mal durante la observación, se corrige como siempre: Anular,
  Deshacer o corregir desde el historial de la persona. Nada se borra.
- No ayudarle mientras hace algo. Si se queda quieta más de 30 segundos, preguntarle
  "¿Qué estás buscando?", sin decirle dónde está.
- Lo que haya que pedirle ("¿cuánto debe…?", "gira el iPad") es solo para mirar, no
  para anotar.

## Cuándo

- Un día normal de trabajo, a la hora de más movimiento, con su luz, sus gafas, su
  tamaño de texto y el iPad donde lo usa siempre.
- Un día de cobro (el 15 o el último del mes) para ver los pagos y el PDF.
- Repetirla una semana después para ver si recuerda cómo hacer las cosas.

## Qué observar

Cada situación se anota cuando pasa sola. Las que no pasen ese día se dejan en blanco:
no se provocan.

| # | Situación | Qué debe pasar | Qué mirar |
|---|---|---|---|
| 1 | Abre la app (en la mañana o tras un rato sin usarla). | Escribe su PIN. | ¿Se equivoca de tecla? ¿Lee el mensaje si falla? |
| 2 | Llega alguien a comprar y lo anota hablando. | Toca el micrófono, habla, revisa la tarjeta y toca Guardar. | ¿Sabe cuándo terminar de hablar? ¿Se corta si hace una pausa? ¿Lee la tarjeta antes de guardar? |
| 3 | Anota una compra sin hablar (hay ruido, la voz falla o lo prefiere). | Toca Anotar a mano, busca a la persona, pone el valor y guarda. | ¿Encuentra Anotar a mano? Si hay dos con el mismo nombre, ¿elige bien? |
| 4 | Aparece "¿Seguro que son $…?" (un valor muy bajo o muy alto). | Lee la pregunta y decide. | ¿La entiende o la salta sin leer? |
| 5 | La interrumpen mientras anota (alguien viene a pagar). | Al volver a Registrar, la compra a medio anotar sigue ahí. | ¿Encuentra la tarjeta al volver? ¿Cree que ya se había guardado? |
| 6 | Se equivoca en algo que anotó. | Toca Anular y confirma, o usa Deshacer en el aviso. | ¿Encuentra Anular? ¿Alcanza a ver el aviso de abajo? |
| 7 | Alguien paga todo o abona. | En Cobrar lo encuentra y toca Pagó todo o Abono. | ¿Usa el buscador o baja por la lista? ¿Entiende la diferencia entre Pagó todo y Abono? |
| 8 | Alguien pregunta cuánto debe (o pedirle: "¿cuánto debe fulano y qué compró?"). | Abre su detalle y lo explica con el historial por quincena. | ¿Explica el saldo con lo que ve, sin sumar de memoria? ¿Sabe volver? |
| 9 | Llega alguien nuevo a comprar. | Lo crea al anotar la compra o con Agregar persona en Cobrar. | ¿Toca Cerrar sin agregar? ¿Le salen personas parecidas y las entiende? |
| 10 | Hace el PDF de la quincena (día de cobro). | En Cobrar, arriba, PDF de la quincena. | ¿Encuentra el botón? ¿Entiende el menú de compartir? |
| 11 | Gira el iPad mientras anota (se le puede pedir). | Se ve igual, en una columna; Guardar se ve con el teclado abierto. | ¿Se desorienta al girar? |
| 12 | Alguien cambió de departamento. | En el detalle de esa persona, Datos, Cambiar departamento. | ¿Lo busca en Ajustes o en el detalle? ¿Encuentra la sección de abajo? |

## Preguntas al final

1. ¿Qué fue lo más difícil?
2. ¿Hubo algo que no pudiste leer bien?
3. ¿Te sentiste segura de que se guardó lo que anotaste? (del 1 al 5)
4. ¿Prefieres dictar o escribir?

## Qué mirar en el iPad, además de Amparo

- La letra sigue un poco el tamaño de texto del iPad (Pantalla y brillo > Tamaño del texto), hasta 19px: ¿se lee bien con el que ella usa? ¿Cabe todo? Si cabe y le sirve, probar subir el tope a 20 en src/lib/letra.ts.
- Con el teclado abierto en horizontal, el botón Guardar se ve al escribir el valor.
- La barra de pestañas no choca con la barra de inicio del iPad.
- El aviso con Deshacer dura unos 20 segundos: ¿le alcanza? ¿Le estorba?
- Con Ajustes > Accesibilidad > Movimiento > Reducir movimiento, no hay animaciones que parpadeen.

## Cuándo va bien

- Lo que pasó ese día lo hizo sola, salvo una cosa como mucho.
- Si la interrumpieron, no perdió la compra que estaba anotando.
- Si se le preguntó por un saldo, lo explicó sin sumar de memoria.
- Califica su confianza en 4 o más.

## Registro

Se puede anotar en la hoja "Prueba con Amparo" que Mariana tiene en claude.ai (una por
ronda: la primera vez y una semana después; calcula sola los criterios de arriba y
Claude puede leerla para analizarla), o en esta tabla. La hoja solo guarda las notas de
la observación: no toca los datos de la app.

| Fecha | Situación | Lo que pasó | Idea para mejorar |
|---|---|---|---|
| | | | |
