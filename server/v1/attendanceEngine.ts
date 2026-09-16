export type AttendancePolicyInput = { startMinute: number; endMinute: number; crossesMidnight: boolean; graceInMinutes: number; graceOutMinutes: number; halfDayAfterMinutes: number; fullDayMinutes: number; overtimeAfterMinutes: number };
export type AttendanceEvaluationInput = { clockIn: Date | null; clockOut: Date | null; breakMinutes: number; policy: AttendancePolicyInput };
export type EvaluatedAttendanceStatus = 'ABSENT' | 'HALF_DAY' | 'LATE' | 'PRESENT';

const minuteOfDay = (value: Date) => value.getUTCHours() * 60 + value.getUTCMinutes();
export function evaluateAttendance(input: AttendanceEvaluationInput) {
  const { clockIn, clockOut, policy } = input;
  const flags: string[] = [];
  if (!clockIn) flags.push('MISSING_CLOCK_IN');
  if (!clockOut) flags.push('MISSING_CLOCK_OUT');
  const scheduledMinutes = (policy.crossesMidnight || policy.endMinute <= policy.startMinute ? policy.endMinute + 1440 : policy.endMinute) - policy.startMinute;
  const workedMinutes = clockIn && clockOut ? Math.max(0, Math.round((clockOut.getTime() - clockIn.getTime()) / 60_000) - input.breakMinutes) : 0;
  const inMinute = clockIn ? minuteOfDay(clockIn) : policy.startMinute;
  let outMinute = clockOut ? minuteOfDay(clockOut) : policy.endMinute;
  if (policy.crossesMidnight && outMinute < policy.startMinute) outMinute += 1440;
  const lateMinutes = clockIn ? Math.max(0, inMinute - policy.startMinute - policy.graceInMinutes) : 0;
  const earlyExitMinutes = clockOut ? Math.max(0, policy.endMinute + (policy.crossesMidnight ? 1440 : 0) - outMinute - policy.graceOutMinutes) : 0;
  const overtimeMinutes = Math.max(0, workedMinutes - policy.overtimeAfterMinutes);
  if (lateMinutes) flags.push('LATE');
  if (earlyExitMinutes) flags.push('EARLY_EXIT');
  if (workedMinutes > 0 && workedMinutes < policy.halfDayAfterMinutes) flags.push('INSUFFICIENT_HOURS');
  if (overtimeMinutes) flags.push('OVERTIME');
  const status: EvaluatedAttendanceStatus = !clockIn ? 'ABSENT' : workedMinutes < policy.halfDayAfterMinutes ? 'HALF_DAY' : lateMinutes ? 'LATE' : 'PRESENT';
  return { status, scheduledMinutes, workedMinutes, breakMinutes: input.breakMinutes, lateMinutes, earlyExitMinutes, overtimeMinutes, flags, explanation: { scheduledWindow: { startMinute: policy.startMinute, endMinute: policy.endMinute, crossesMidnight: policy.crossesMidnight }, thresholds: { graceInMinutes: policy.graceInMinutes, graceOutMinutes: policy.graceOutMinutes, halfDayAfterMinutes: policy.halfDayAfterMinutes, fullDayMinutes: policy.fullDayMinutes, overtimeAfterMinutes: policy.overtimeAfterMinutes } } };
}
