import type { Request, Response } from 'express'
import { query } from '../db.js'
import { normalizedMeterColumnSql } from '../lab-trail-status.js'
import {
  findNextAvailableSlot,
  scheduleSlotKey,
  summarizeUpcomingCapacity,
} from '../schedule-slots.js'

const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

function roundOne(value: number | null) {
  if (value == null || !Number.isFinite(value)) return null
  return Math.round(value * 100) / 100
}

function asNumber(value: string | number | null | undefined) {
  if (value == null || value === '') return 0
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : 0
}

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function brazilTodayParts(date = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  ) as Record<string, string>
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  }
}

function daysUntil(target: Date) {
  const today = brazilTodayParts()
  const slot = brazilTodayParts(target)
  const from = Date.UTC(today.year, today.month - 1, today.day)
  const to = Date.UTC(slot.year, slot.month - 1, slot.day)
  return Math.max(0, Math.round((to - from) / 86_400_000))
}

function formatSlot(date: Date) {
  const parts = brazilTodayParts(date)
  return `${pad(parts.day)}/${pad(parts.month)}/${parts.year} ${pad(parts.hour)}:${pad(parts.minute)}:00`
}

const SCHEDULE_NORM = normalizedMeterColumnSql('ms')
const REGISTRY_NORM = normalizedMeterColumnSql('mr')
const LAUDO_NORM = normalizedMeterColumnSql('rl')

const SCHEDULED_DATE = `(ms.scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date`
const DEADLINE = `(${SCHEDULED_DATE} - CASE
  WHEN ((EXTRACT(DOW FROM ${SCHEDULED_DATE})::int + 2) % 7) = 0 THEN 7
  ELSE ((EXTRACT(DOW FROM ${SCHEDULED_DATE})::int + 2) % 7)
END)`

export async function getLabVisaoDashboard(req: Request, res: Response) {
  const requested = Number(req.query.year)
  const today = brazilTodayParts()
  const year = Number.isInteger(requested) && requested >= 2000 && requested <= 2100
    ? requested
    : today.year

  const [yearsResult, monthlyResult, inspectionsResult, filaResult, upcomingResult, blocksResult, occupiedResult] =
    await Promise.all([
      query<{ year: number }>(
        `SELECT DISTINCT EXTRACT(YEAR FROM scheduled_at AT TIME ZONE 'America/Sao_Paulo')::int AS year
         FROM meter_schedules
         ORDER BY 1 DESC`,
      ),
      query<{
        month: number
        agendado: string
        ensaiado: string
        prazo_sum: string | null
        prazo_count: string
        tma_sum: string | null
        tma_count: string
        atrasados: string
        a_receber: string
        recebido_com_atraso: string
        recebido_sem_atraso: string
      }>(
        `SELECT EXTRACT(MONTH FROM ${SCHEDULED_DATE})::int AS month,
                COUNT(*) FILTER (WHERE ms.delay_dismissed_at IS NULL)::int AS agendado,
                COUNT(*) FILTER (WHERE ms.delay_dismissed_at IS NULL AND ensaiado.ok)::int AS ensaiado,
                COALESCE(SUM(prazo.days) FILTER (WHERE ms.delay_dismissed_at IS NULL), 0) AS prazo_sum,
                COUNT(prazo.days) FILTER (WHERE ms.delay_dismissed_at IS NULL)::int AS prazo_count,
                COALESCE(SUM(tma.days) FILTER (WHERE ms.delay_dismissed_at IS NULL), 0) AS tma_sum,
                COUNT(tma.days) FILTER (WHERE ms.delay_dismissed_at IS NULL)::int AS tma_count,
                COUNT(*) FILTER (
                  WHERE ms.delay_dismissed_at IS NULL
                    AND aguardando.ok
                    AND ${DEADLINE} < (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
                )::int AS atrasados,
                COUNT(*) FILTER (
                  WHERE ms.delay_dismissed_at IS NULL
                    AND aguardando.ok
                    AND ${DEADLINE} >= (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
                )::int AS a_receber,
                COUNT(*) FILTER (
                  WHERE ms.delay_dismissed_at IS NULL
                    AND NOT aguardando.ok
                    AND (ms.received_at IS NOT NULL OR mr.received_at IS NOT NULL)
                    AND recebimento.received_date > ${DEADLINE}
                )::int AS recebido_com_atraso,
                COUNT(*) FILTER (
                  WHERE ms.delay_dismissed_at IS NULL
                    AND NOT aguardando.ok
                    AND (
                      (ms.received_at IS NULL AND mr.received_at IS NULL)
                      OR recebimento.received_date <= ${DEADLINE}
                    )
                )::int AS recebido_sem_atraso
         FROM meter_schedules ms
         LEFT JOIN meter_registry mr ON ${REGISTRY_NORM} = ${SCHEDULE_NORM}
         LEFT JOIN LATERAL (
           SELECT MIN((rl.created_at AT TIME ZONE 'America/Sao_Paulo')::date) AS laudo_date
           FROM ratm_laudos rl
           WHERE rl.revoked_at IS NULL
             AND ${LAUDO_NORM} = ${SCHEDULE_NORM}
         ) laudo ON TRUE
         CROSS JOIN LATERAL (
           SELECT (
             BTRIM(ms.trail_step) IN ('Aprovação de RATM', 'Sucata', 'Pesquisa de satisfação')
             OR BTRIM(COALESCE(mr.status, '')) IN ('Ensaiado', 'Aprovado')
             OR laudo.laudo_date IS NOT NULL
           ) AS ok
         ) ensaiado
         CROSS JOIN LATERAL (
           SELECT (
             ms.received_at IS NULL
             AND NOT (
               mr.received_at IS NOT NULL
               OR BTRIM(COALESCE(mr.status, '')) IN ('Recebido', 'Ensaiado', 'Aprovado')
             )
           ) AS ok
         ) aguardando
         CROSS JOIN LATERAL (
           SELECT COALESCE(
             (ms.received_at AT TIME ZONE 'America/Sao_Paulo')::date,
             (mr.received_at AT TIME ZONE 'America/Sao_Paulo')::date,
             ${SCHEDULED_DATE}
           ) AS received_date
         ) recebimento
         CROSS JOIN LATERAL (
           SELECT GREATEST(
             0,
             ${SCHEDULED_DATE} - COALESCE(
               ms.scheduling_date,
               (ms.created_at AT TIME ZONE 'America/Sao_Paulo')::date
             )
           ) AS days
         ) prazo
         CROSS JOIN LATERAL (
           SELECT CASE
             WHEN ensaiado.ok AND (
               ms.received_at IS NOT NULL OR mr.received_at IS NOT NULL
             ) THEN GREATEST(
               0,
               COALESCE(laudo.laudo_date, ${SCHEDULED_DATE}) - COALESCE(
                 (ms.received_at AT TIME ZONE 'America/Sao_Paulo')::date,
                 (mr.received_at AT TIME ZONE 'America/Sao_Paulo')::date
               )
             )
           END AS days
         ) tma
         WHERE EXTRACT(YEAR FROM ${SCHEDULED_DATE}) = $1
         GROUP BY 1
         ORDER BY 1`,
        [year],
      ),
      query<{ day: string; total: string }>(
        `SELECT (created_at AT TIME ZONE 'America/Sao_Paulo')::date::text AS day,
                COUNT(*)::int AS total
         FROM meter_inspection_documents
         WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'America/Sao_Paulo') = $1
         GROUP BY 1
         ORDER BY 1`,
        [year],
      ),
      query<{ meter: string; days: number }>(
        `SELECT meter, days
         FROM (
           SELECT DISTINCT ON (${SCHEDULE_NORM})
                  ms.meter,
                  GREATEST(
                    0,
                    (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
                      - COALESCE(
                          ms.scheduling_date,
                          (ms.created_at AT TIME ZONE 'America/Sao_Paulo')::date
                        )
                  )::int AS days
           FROM meter_schedules ms
           LEFT JOIN meter_registry mr ON ${REGISTRY_NORM} = ${SCHEDULE_NORM}
           WHERE ms.delay_dismissed_at IS NULL
             AND BTRIM(ms.trail_step) = 'Ensaiar'
             AND BTRIM(COALESCE(mr.status, '')) NOT IN ('Ensaiado', 'Aprovado')
             AND NOT EXISTS (
               SELECT 1 FROM ratm_laudos rl
               WHERE rl.revoked_at IS NULL
                 AND ${LAUDO_NORM} = ${SCHEDULE_NORM}
             )
           ORDER BY ${SCHEDULE_NORM},
                    COALESCE(
                      ms.scheduling_date,
                      (ms.created_at AT TIME ZONE 'America/Sao_Paulo')::date
                    ) ASC
         ) fila
         ORDER BY days DESC, meter ASC`,
      ),
      query<{ total: string }>(
        `SELECT COUNT(*)::int AS total
         FROM meter_schedules
         WHERE delay_dismissed_at IS NULL
           AND (scheduled_at AT TIME ZONE 'America/Sao_Paulo')::date
             BETWEEN (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date
             AND (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date + 29`,
      ),
      query<{ blocked_date: string }>(`SELECT blocked_date::text AS blocked_date FROM ensaios_manual_blocks`),
      query<{ scheduled_at: Date }>(
        `SELECT scheduled_at FROM meter_schedules WHERE delay_dismissed_at IS NULL`,
      ),
    ])

  const byMonth = new Map(monthlyResult.rows.map((row) => [Number(row.month), row]))
  const monthly = MONTHS.map((month) => {
    const row = byMonth.get(month)
    return {
      month,
      agendado: asNumber(row?.agendado),
      ensaiado: asNumber(row?.ensaiado),
      prazoSum: asNumber(row?.prazo_sum),
      prazoCount: asNumber(row?.prazo_count),
      tmaSum: asNumber(row?.tma_sum),
      tmaCount: asNumber(row?.tma_count),
      atrasados: asNumber(row?.atrasados),
      aReceber: asNumber(row?.a_receber),
      recebidoComAtraso: asNumber(row?.recebido_com_atraso),
      recebidoSemAtraso: asNumber(row?.recebido_sem_atraso),
    }
  })

  const manualBlocks = new Set(blocksResult.rows.map((row) => row.blocked_date.slice(0, 10)))
  const occupiedSlots = new Set(occupiedResult.rows.map((row) => scheduleSlotKey(new Date(row.scheduled_at))))
  const capacity = summarizeUpcomingCapacity(manualBlocks, occupiedSlots)
  const nextSlot = findNextAvailableSlot(manualBlocks, occupiedSlots)
  const years = yearsResult.rows.map((row) => Number(row.year)).filter((item) => Number.isFinite(item))

  res.json({
    year,
    years: years.includes(year) ? years : [year, ...years],
    next30: {
      scheduled: asNumber(upcomingResult.rows[0]?.total),
      availabilityPercent:
        capacity.totalSlots > 0 ? Math.round((capacity.freeSlots / capacity.totalSlots) * 100) : null,
    },
    prazoAtendimento: nextSlot
      ? { days: daysUntil(nextSlot), label: formatSlot(nextSlot) }
      : { days: null, label: null },
    monthly: monthly.map((item) => ({
      ...item,
      prazoSum: roundOne(item.prazoSum) ?? 0,
      tmaSum: roundOne(item.tmaSum) ?? 0,
    })),
    inspecoes: inspectionsResult.rows.map((row) => ({
      date: row.day.slice(0, 10),
      total: asNumber(row.total),
    })),
    filaEspera: filaResult.rows.map((row) => ({
      meter: row.meter,
      days: asNumber(row.days),
    })),
  })
}
