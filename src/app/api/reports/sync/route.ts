import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import {
  appendWeeklyReportToSheet,
  type WeeklySyncPayload,
} from '../../../../lib/google-sheets';

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message, message }, { status });
}

function hasSupabaseSessionCookie(request: Request) {
  return /\bsb-[^=;]+-auth-token(?:\.\d+)?=/.test(
    request.headers.get('cookie') ?? ''
  );
}

function hasValidSupabaseConfiguration() {
  const runtimeEnv = process.env;
  const url = runtimeEnv['NEXT_PUBLIC_SUPABASE_URL'];
  const key = runtimeEnv['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];

  if (!url || !key || !key.startsWith('sb_publishable_')) {
    return false;
  }

  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === 'https:' &&
      !parsedUrl.hostname.includes('placeholder') &&
      !key.includes('placeholder')
    );
  } catch {
    return false;
  }
}

function getWeekEnd(weekStart: string) {
  const date = new Date(`${weekStart}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

export async function POST(request: Request) {
  if (!hasValidSupabaseConfiguration()) {
    return hasSupabaseSessionCookie(request)
      ? jsonError('Authentication is temporarily unavailable.', 503)
      : jsonError('Unauthorized.', 401);
  }

  let supabase;
  let user;
  try {
    supabase = await createClient();
    const {
      data: { user: authenticatedUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError) {
      return authError.name === 'AuthSessionMissingError'
        ? jsonError('Unauthorized.', 401)
        : jsonError('Authentication is temporarily unavailable.', 503);
    }

    user = authenticatedUser;
  } catch {
    return hasSupabaseSessionCookie(request)
      ? jsonError('Authentication is temporarily unavailable.', 503)
      : jsonError('Unauthorized.', 401);
  }

  if (!user) {
    return jsonError('Unauthorized.', 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('A valid JSON request body is required.', 400);
  }

  const weekStart =
    typeof body === 'object' && body !== null && 'weekStart' in body
      ? body.weekStart
      : undefined;
  const parsedWeekStart =
    typeof weekStart === 'string'
      ? new Date(`${weekStart}T00:00:00.000Z`)
      : null;

  if (
    typeof weekStart !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(weekStart) ||
    !parsedWeekStart ||
    !Number.isFinite(parsedWeekStart.getTime()) ||
    parsedWeekStart.toISOString().slice(0, 10) !== weekStart
  ) {
    return jsonError('A valid weekStart date (YYYY-MM-DD) is required.', 400);
  }

  try {
    const { data: report, error: reportError } = await supabase
      .from('weekly_reports')
      .select('week_start, alignment_score, target_completion_percent')
      .eq('user_id', user.id)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (reportError) {
      return jsonError('Could not load the saved weekly report.', 500);
    }
    if (!report) {
      return jsonError('No saved weekly report was found for that week.', 404);
    }

    const weekEnd = getWeekEnd(weekStart);
    const [
      { data: profile, error: profileError },
      { data: priorities, error: prioritiesError },
      { data: checkins, error: checkinsError },
      { data: experiment, error: experimentError },
    ] = await Promise.all([
      supabase
        .from('profiles')
        .select('display_name')
        .eq('id', user.id)
        .maybeSingle(),
      supabase
        .from('priorities')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('active', true),
      supabase
        .from('daily_checkins')
        .select('id, sleep_minutes')
        .eq('user_id', user.id)
        .gte('checkin_date', weekStart)
        .lte('checkin_date', weekEnd),
      supabase
        .from('experiments')
        .select(
          'target_priority_id, transfer_minutes_per_day, starts_on, status'
        )
        .eq('user_id', user.id)
        .in('status', ['completed', 'cancelled', 'active'])
        .gte('ends_on', weekStart)
        .lte('starts_on', weekEnd)
        .limit(1)
        .maybeSingle(),
    ]);

    if (profileError || prioritiesError || checkinsError || experimentError) {
      return jsonError('Could not load this user’s weekly report data.', 500);
    }

    const checkinIds = (checkins ?? []).map((checkin) => checkin.id);
    let timeEntries: { priority_id: string; minutes: number }[] = [];
    if (checkinIds.length > 0) {
      const { data, error } = await supabase
        .from('time_entries')
        .select('priority_id, minutes')
        .eq('user_id', user.id)
        .in('checkin_id', checkinIds);

      if (error) {
        return jsonError('Could not load this user’s weekly report data.', 500);
      }
      timeEntries = data ?? [];
    }

    const minutesByPriority = new Map<string, number>();
    for (const entry of timeEntries) {
      minutesByPriority.set(
        entry.priority_id,
        (minutesByPriority.get(entry.priority_id) ?? 0) + entry.minutes
      );
    }

    const studyMinutes = (priorities ?? [])
      .filter((priority) => /study|computer|science|learn/i.test(priority.name))
      .reduce(
        (total, priority) =>
          total + (minutesByPriority.get(priority.id) ?? 0),
        0
      );
    const fitnessMinutes = (priorities ?? [])
      .filter((priority) =>
        /fitness|health|strength|gym|exercise/i.test(priority.name)
      )
      .reduce(
        (total, priority) =>
          total + (minutesByPriority.get(priority.id) ?? 0),
        0
      );
    const passionMinutes = (priorities ?? [])
      .filter(
        (priority) =>
          !/study|computer|science|learn|fitness|health|strength|gym|exercise/i.test(
            priority.name
          )
      )
      .reduce(
        (total, priority) =>
          total + (minutesByPriority.get(priority.id) ?? 0),
        0
      );

    const sleepEntries = (checkins ?? []).filter(
      (checkin) => checkin.sleep_minutes !== null
    );
    const averageSleepMinutes =
      sleepEntries.length > 0
        ? Math.round(
            sleepEntries.reduce(
              (total, checkin) => total + (checkin.sleep_minutes ?? 0),
              0
            ) / sleepEntries.length
          )
        : 0;

    let experimentOutcome = 'No active experiment this week';
    if (experiment) {
      const priorityName =
        priorities?.find(
          (priority) => priority.id === experiment.target_priority_id
        )?.name ?? 'target priority';
      if (experiment.status === 'active') {
        const daysDone = Math.min(
          7,
          Math.max(
            0,
            Math.floor(
              (new Date(`${weekEnd}T23:59:59.000Z`).getTime() -
                new Date(`${experiment.starts_on}T00:00:00.000Z`).getTime()) /
                86_400_000
            ) + 1
          )
        );
        experimentOutcome = `${daysDone} of 7 days toward +${experiment.transfer_minutes_per_day}m/day on ${priorityName}`;
      } else if (experiment.status === 'completed') {
        experimentOutcome = `Completed all 7 days of +${experiment.transfer_minutes_per_day}m/day to ${priorityName}`;
      } else {
        experimentOutcome = `Experiment on ${priorityName} was abandoned before completion`;
      }
    }

    const payload: WeeklySyncPayload = {
      weekStart: report.week_start,
      userDisplayName:
        profile?.display_name ||
        (typeof user.user_metadata?.full_name === 'string'
          ? user.user_metadata.full_name
          : null) ||
        user.phone ||
        'Reflector',
      alignmentScore: report.alignment_score,
      targetCompletionPercent: report.target_completion_percent,
      studyMinutes,
      fitnessMinutes,
      passionMinutes,
      averageSleepMinutes,
      experimentOutcome,
      generatedAt: new Date().toISOString(),
    };

    const syncResult = await appendWeeklyReportToSheet(payload);
    if (!syncResult.success) {
      return jsonError('Could not sync the weekly report to Google Sheets.', 503);
    }

    await supabase
      .from('weekly_reports')
      .update({ sheet_synced_at: payload.generatedAt })
      .eq('user_id', user.id)
      .eq('week_start', report.week_start);

    return NextResponse.json({
      success: true,
      message: 'Weekly report appended to Google Sheets successfully.',
      timestamp: payload.generatedAt,
    });
  } catch {
    return jsonError('Could not sync the weekly report.', 500);
  }
}
