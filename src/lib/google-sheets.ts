import { google } from 'googleapis';

export interface WeeklySyncPayload {
  weekStart: string;
  userDisplayName: string;
  alignmentScore: number;
  targetCompletionPercent: number;
  studyMinutes: number;
  fitnessMinutes: number;
  passionMinutes: number;
  averageSleepMinutes: number;
  experimentOutcome: string;
  generatedAt: string;
}

export async function appendWeeklyReportToSheet(payload: WeeklySyncPayload): Promise<{ success: boolean; error?: string }> {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawPrivateKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

  if (!spreadsheetId || !clientEmail || !rawPrivateKey) {
    return {
      success: false,
      error: 'Google Sheets credentials are not configured in environment variables (GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY).',
    };
  }

  try {
    // Handle escaped newlines in private key
    const privateKey = rawPrivateKey.replace(/\\n/g, '\n');

    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    // Ensure header row exists or append row to Sheet1
    const rowValues = [
      payload.weekStart,
      payload.userDisplayName,
      payload.alignmentScore,
      `${payload.targetCompletionPercent}%`,
      payload.studyMinutes,
      payload.fitnessMinutes,
      payload.passionMinutes,
      payload.averageSleepMinutes,
      payload.experimentOutcome,
      payload.generatedAt,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'Sheet1!A:J',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowValues],
      },
    });

    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown Google Sheets error';
    return { success: false, error: errorMsg };
  }
}
