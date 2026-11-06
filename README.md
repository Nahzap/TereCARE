# TereCARE

**Ficha compartida de cuidado domiciliario** — pensada primero para Teresa y su red familiar: una sola fuente de verdad para medicamentos, signos, citas, gastos, turnos y aportes (tiempo y dinero), sin depender de chats ni cuadernos paralelos.

Este README describe **qué puede hacer el producto** y **cómo está construido**, con el nivel de detalle que se esperaría al evaluar un desarrollo de software moderno asistido por IA: dominio claro, restricciones de seguridad explícitas, trazabilidad contable y disciplina de entrega.

---

## 1. Propuesta de valor

| Problema familiar | Respuesta de TereCARE |
|-------------------|------------------------|
| “¿Ya le dieron la pastilla?” | Posología semanal/diaria con marcas de toma |
| “¿Cuánto midió la presión?” | Historial y tendencia en Dashboard |
| “¿Cuándo es la próxima cita?” | Agenda con estados y orden cronológico |
| “¿Quién pagó qué?” | Gastos tipados, con comprador y detalle libre |
| “¿Quién cuida hoy / esta semana?” | Grilla horaria + fila de almuerzo |
| “¿Cómo se reparte el esfuerzo?” | Aporte equivalente: dinero + horas + almuerzos valorizados |

Roles:

- **Dueño (owner):** administra la ficha, invitaciones, acceso y puede editar **cualquier** turno/almuerzo.
- **Cuidador (caregiver):** opera el día a día; en el horario **solo edita lo suyo**.
- **Consulta (viewer):** lectura.

---

## 2. Capacidades por módulo

### 2.1 Posología

- Plan de medicamentos por semana y vista por día.
- Marcado de tomas administradas.
- Conciencia de **situación de cuidado** (alta / hospitalización): días que no deben entrar en indicadores.

### 2.2 Presión arterial

- Altas, edición y borrado de lecturas (sistólica, diastólica, pulso, momento del día).
- Serie temporal en Dashboard.

### 2.3 Citas médicas

- Alta / corrección / borrado.
- Estados: programada, asistió, se perdió, cancelada.
- Orden: pendientes de lo más cercano a lo más lejano; historial cronológico.
- Edición estable (Corregir → Guardar / Cancelar) sin “parpadeo” de formulario.

### 2.4 Gastos del cuidado

- Tipos (medicamentos, cita, terapia, etc.) + **detalle libre**.
- Estados de pago: pagado, pendiente, pagándose (cuotas), cubierto.
- Comprador = persona de cuidado.
- Montos enteros CLP; fechas (también futuras si se conoce el gasto).
- Alimenta el gráfico de gastos acumulados y el aporte equivalente.

### 2.5 Personas, cuidadores y acceso

- Personas de cuidado con o sin cuenta (`care_people`), fusionables, invitables.
- Nombre, correo, teléfono; invitaciones por rol cuidador/consulta.
- Acceso a la ficha (miembros, roles); flujos de contraseña / vinculación según despliegue.
- **Dueño** administra personas y acceso; el cuidador no reescribe el directorio ajeno.

### 2.6 Horario de cuidado (cobertura)

- Grilla **hora × día** (zona America/Santiago).
- Pintura por rectángulo, varias personas por hora (franjas), goma, Guardar / Descartar.
- Horizonte de planificación **hasta 90 días** hacia adelante; historial navegable.
- Totales por persona (cumplidas vs planificadas) y resumen de cobertura.
- Días hospital / pre-alta **excluidos** del indicador.

#### Almuerzo (módulo aislado)

- Fila **amarilla** entre **13:00 y 14:00**.
- **No** cuenta como hora de cobertura (no distorsiona el `/24`).
- 1 cuidador habitual; **máximo 2** por día.
- Valorización: default **$9.000 CLP/día** y **1,5 h** configurables.
- Sello histórico: reajustar tarifa **no reescribe** almuerzos ya anotados.

#### Permisos en la grilla

| Acción | Dueño | Cuidador |
|--------|-------|----------|
| Ver toda la grilla | Sí | Sí |
| Pintar / borrar **su** horario y almuerzo | Sí | Sí |
| Pintar / borrar **otro** cuidador | Sí | **No** (UI + API + trigger BD) |

### 2.7 Dashboard

Rango seleccionable (7 / 30 / 90 días):

- Tomas de medicamentos por día  
- Serie de presión  
- Horas con cuidador (por día y por persona)  
- Citas por estado  
- **Gastos acumulados por cuidador** (líneas)  
- **Aporte total equivalente** (dinero + horas selladas + almuerzos sellados)  
- **Almuerzos valorizados** (líneas + reajuste de tarifa/horas)  
- Desglose de gastos por tipo/comprador  
- Registro unificado filtrable  

Los gráficos comparten el mismo formato de tarjeta y altura de plot (`h-64`) en grilla de dos columnas.

#### Reglas del aporte equivalente

\[
\text{aporte}_i = \text{dinero}_i + \sum \text{tarifa\_hora sellada} + \sum \text{tarifa\_almuerzo sellada}
\]

- Tarifa hora default: **$3.500 CLP/h** (referencia tipo TENS).  
- Tarifa almuerzo default: **$9.000 CLP/día**.  
- Cambios de tarifa: solo aplican hacia adelante.

---

## 3. Arquitectura técnica (visión de evaluación)

| Capa | Elección |
|------|----------|
| App | **Next.js 16** (App Router) + **React 19** + TypeScript |
| UI | Tailwind CSS 4; tipografía y layout orientados a uso diario familiar |
| Auth / datos | **Supabase** (Auth, Postgres, RLS, RPC) |
| Validación | **Zod** en bordes de API |
| Gráficos | **Recharts** |
| Tests | **Vitest** sobre dominio puro (cobertura, aportes, almuerzo, citas, gastos, fechas) |
| Estilo de entrega | Commits correlativos (`1c`…`4c`) en `master`; docs locales con fecha/hora |

### Patrones de diseño que importan

1. **Dominio en `lib/`**, UI en `components/`, HTTP en `app/api/` — reglas de negocio testeables sin montar React.
2. **Sello temporal de tarifas** (horas y almuerzos): contabilidad familiar auditable; el pasado no se reescribe.
3. **Degradación controlada** si falta una migración (mensajes 503 claros; fallbacks en lecturas).
4. **Defensa en profundidad** para turnos: UI + API + trigger Postgres.
5. **Situación de cuidado** (alta/hospital) como filtro transversal de indicadores.
6. **Personas ≠ cuentas**: `care_people` puede existir antes del login; luego se vincula sin perder historial.

### Stack declarado (`package.json`)

- Runtime: `next@16.4.3`, `react@19.3`, `@supabase/ssr` / `supabase-js`
- Calidad: `typescript`, `eslint` + `eslint-config-next`, `vitest`
- Visualización: `recharts`

Scripts: `dev`, `build`, `start`, `lint`, `test`.

---

## 4. Mapa de la aplicación (usuario)

| Dónde | Para qué |
|-------|----------|
| **Inicio** | Lista de fichas |
| **Posología** | Medicamentos y tomas |
| **Presión** | Mediciones |
| **Citas** | Agenda médica |
| **Gastos** | Dinero del cuidado |
| **Dashboard** | Resumen e indicadores |
| **Cuidadores** | Personas + **horario** (+ almuerzo) |
| **Acceso** | Quién entra y con qué rol |

Arranque local típico: doble clic en `Start.cmd` → sesión → ficha.

---

## 5. Seguridad y roles (resumen)

| Rol | Mirar | Anotar operativo | Editar horario ajeno | Administrar acceso/personas |
|-----|-------|------------------|---------------------|-----------------------------|
| Dueño | Sí | Sí | **Sí** | Sí |
| Cuidador | Sí | Sí | **No** | No |
| Consulta | Sí | No | No | No |

RLS en tablas sensibles; mutaciones de cobertura/almuerzo validadas también en servidor y, tras la migración correspondiente, en triggers.

La ficha contiene datos de salud y familia: el diseño asume **mínimo privilegio** y membresía explícita por paciente.

---

## 6. Desarrollo asistido por IA — cómo se usó (transparencia)

Este proyecto se construyó y evoluciona con **asistencia de agentes de código (Cursor)** bajo dirección humana. Eso no reemplaza criterio de producto; lo acelera cuando hay disciplina:

| Práctica | Evidencia en el repo |
|----------|----------------------|
| Decisiones de dominio **antes** de codear | Almuerzo: fila aislada, sello, máx. 2, opción A de gráficos |
| Pruebas unitarias del núcleo | `lib/**/*.test.ts` (Vitest) |
| Migraciones SQL versionadas localmente | `supabase/migrations/` (aplicar en el proyecto remoto) |
| Registros de trabajo fechados | `docs/YYYY-MM-DD_HHMM_registro-trabajo.md` |
| Entrega incremental trazable | Commits `Nc` + push a GitHub |
| Límites explícitos | MCP sin permiso DDL → migraciones manuales documentadas |

**Qué evaluar en una revisión humana+IA:** claridad del dominio, coherencia UI/API/BD, tests del comportamiento crítico, y honestidad sobre lo pendiente (p. ej. aplicar SQL en Supabase).

---

## 7. Cómo abrir y verificar

1. `Start.cmd` (o `npm run dev` con env local).  
2. Sesión con cuenta miembro de la ficha.  
3. Smoke checklist sugerido:
   - Marcar una toma; anotar presión; crear/editar cita.  
   - Anotar gasto con tipo + detalle.  
   - Pintar horas; asignar fila Alm; Guardar.  
   - Como cuidador, comprobar que **no** puedes borrar horas ajenas.  
   - Dashboard 7/30/90: gráficos alineados; aporte con tres componentes.  
4. Tests: `npm test`.

---

## 8. Qué no es TereCARE

- No sustituye indicación médica ni urgencias.  
- No es ERP/facturación formal: montos y tarifas son **acuerdos familiares** para transparentar aportes.  
- No es un producto “genérico multi-tenant SaaS” aún: el foco es la ficha real de cuidado con roles familiares.

---

## 9. Problemas frecuentes

| Situación | Qué revisar |
|-----------|-------------|
| Sección vacía o 503 de “falta migración” | SQL pendiente en Supabase (`care_lunches`, tarifas, teléfono, etc.) |
| Cuidador no puede editar | Debe estar vinculado a una persona de cuidado; solo edita lo propio |
| Cambié tarifa y el pasado “no cambió” | Correcto: sello histórico |
| Almuerzo “rompe” el `/24` | No debería: la fila Alm está aislada; si pasa, es bug a reportar |
| Gráfico de aporte enorme | En `4c` se unificó el tamaño; haz pull |

---

## 10. Resumen

**TereCARE es una ficha operativa de cuidado domiciliario con trazabilidad clínica ligera, turnos (incl. almuerzo valorizado), gastos y un aporte equivalente auditable — construida con Next.js/Supabase, dominio testeado, permisos por rol y entrega versionada, incluyendo trabajo asistido por IA bajo control humano.**

---

### Referencias de registro

- `docs/2026-11-03_2322_registro-trabajo.md` — gastos, citas, aporte horas, horizonte 90 días  
- `docs/2026-11-05_2236_registro-trabajo.md` — almuerzos, Dashboard, permisos cuidador vs dueño, commit `4c`
