import type { CloudSandboxPlanState } from './log-time-range'
import { useTranslation } from 'react-i18next'
import {
  CLOUD_SANDBOX_CLEARED_TIME_PERIOD,
  CLOUD_SANDBOX_TIME_PERIOD_KEYS,
  isLogTimePeriodRestricted,
  resolveLogTimePeriodOption,
  TIME_PERIOD_MAPPING,
} from './log-time-range'

export function useLogTimeFilterOptions(planState: CloudSandboxPlanState) {
  const { t } = useTranslation(['appLog'])
  const restricted = isLogTimePeriodRestricted(planState)
  const periods = Object.entries(TIME_PERIOD_MAPPING)
    .filter(([value]) => !restricted || CLOUD_SANDBOX_TIME_PERIOD_KEYS.has(value))
    .map(([value, option]) => {
      const { name } = resolveLogTimePeriodOption(value, option, planState)
      return { value, label: t(($) => $[`filter.period.${name}`], { ns: 'appLog' }) }
    })
  return {
    periods,
    allowCustom: !restricted,
    clearedPeriod: restricted ? CLOUD_SANDBOX_CLEARED_TIME_PERIOD : '9',
  }
}
