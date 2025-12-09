import React, { useState } from "react";
import ReactDOM from "react-dom/client";

/* -------------------------------------------------------------------
   Utility Functions
---------------------------------------------------------------------*/

function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function overlapMinutes(start1: number, end1: number, start2: number, end2: number): number {
  const start = Math.max(start1, start2);
  const end = Math.min(end1, end2);
  return Math.max(0, end - start);
}

function toHours(mins: number): number {
  return Math.round((mins / 60) * 100) / 100;
}

function getDayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()];
}

// Round any positive minutes up to the next 15-minute block
function roundUpToQuarter(mins: number): number {
  if (mins <= 0) return 0;
  return Math.ceil(mins / 15) * 15;
}

/* -------------------------------------------------------------------
   NSW Public Holidays (2016–2026)
---------------------------------------------------------------------*/

const NSW_PUBLIC_HOLIDAYS = new Set<string>([
  // 2016
  "2016-01-01","2016-01-26","2016-03-25","2016-03-26","2016-03-27","2016-03-28",
  "2016-04-25","2016-06-13","2016-10-03","2016-12-25","2016-12-26","2016-12-27",

  // 2017
  "2017-01-01","2017-01-02","2017-01-26","2017-04-14","2017-04-15","2017-04-16",
  "2017-04-17","2017-04-25","2017-06-12","2017-10-02","2017-12-25","2017-12-26",

  // 2018
  "2018-01-01","2018-01-26","2018-03-30","2018-03-31","2018-04-01","2018-04-02",
  "2018-04-25","2018-06-11","2018-10-01","2018-12-25","2018-12-26",

  // 2019
  "2019-01-01","2019-01-26","2019-01-28","2019-04-19","2019-04-20","2019-04-21",
  "2019-04-22","2019-04-25","2019-06-10","2019-10-07","2019-12-25","2019-12-26",

  // 2020
  "2020-01-01","2020-01-26","2020-01-27","2020-04-10","2020-04-11","2020-04-12",
  "2020-04-13","2020-04-25","2020-06-08","2020-10-05","2020-12-25","2020-12-26","2020-12-28",

  // 2021
  "2021-01-01","2021-01-26","2021-04-02","2021-04-03","2021-04-04","2021-04-05",
  "2021-04-25","2021-06-14","2021-10-04","2021-12-25","2021-12-26","2021-12-27","2021-12-28",

  // 2022
  "2022-01-01","2022-01-03","2022-01-26","2022-04-15","2022-04-16","2022-04-17",
  "2022-04-18","2022-04-25","2022-06-13","2022-09-22","2022-10-03","2022-12-25",
  "2022-12-26","2022-12-27",

  // 2023
  "2023-01-01","2023-01-02","2023-01-26","2023-04-07","2023-04-08","2023-04-09",
  "2023-04-10","2023-04-25","2023-06-12","2023-10-02","2023-12-25","2023-12-26",

  // 2024
  "2024-01-01","2024-01-26","2024-03-29","2024-03-30","2024-03-31","2024-04-01",
  "2024-04-25","2024-06-10","2024-10-07","2024-12-25","2024-12-26",

  // 2025
  "2025-01-01","2025-01-27","2025-04-18","2025-04-19","2025-04-20","2025-04-21",
  "2025-04-25","2025-06-09","2025-10-06","2025-12-25","2025-12-26",

  // 2026
  "2026-01-01","2026-01-26","2026-04-03","2026-04-04","2026-04-05","2026-04-06",
  "2026-04-25","2026-06-08","2026-10-05","2026-12-25","2026-12-26","2026-12-28",
]);

function isPublicHoliday(dateStr: string): boolean {
  return NSW_PUBLIC_HOLIDAYS.has(dateStr);
}

/* -------------------------------------------------------------------
   Calculation Result Type
---------------------------------------------------------------------*/

type CalculationResult = {
  dayOfWeek: string;
  isWeekend: boolean;
  isPublicHoliday: boolean;
  paidHours: number;
  ordinaryHours: number;
  overtime15: number;
  overtime20: number;
  publicHoliday15: number;
  publicHoliday25: number;
  minimumRuleApplied: boolean;
  mealAllowances: number;
  mealRules: string[];
  explanation: string;
};

/* -------------------------------------------------------------------
   Payroll Rules Engine
   - Segment-based OT rounding: each OT/PH segment rounded up to 15 min
   - Sunday / Public Holiday minimum 4 hours paid
---------------------------------------------------------------------*/

function applyRules(
  dateStr: string,
  startStr: string,
  endStr: string,
  breakMinutesInput: string
): CalculationResult | null {

  if (!dateStr || !startStr || !endStr) return null;

  const dayOfWeek = getDayOfWeek(dateStr);
  const isPH = isPublicHoliday(dateStr);
  const isSunday = dayOfWeek === "Sunday";
  const isWeekend = dayOfWeek === "Saturday" || dayOfWeek === "Sunday";

  const start = parseTimeToMinutes(startStr);
  const end = parseTimeToMinutes(endStr);
  if (end <= start) return null;

  const breakMinutes = Math.max(0, Number(breakMinutesInput) || 0);

  const spanStart = 8 * 60;
  const spanEnd = 20 * 60;

  // Raw overlap in each segment before break
  const preSpan = overlapMinutes(start, end, 0, spanStart);
  const inSpan = overlapMinutes(start, end, spanStart, spanEnd);
  const postSpan = overlapMinutes(start, end, spanEnd, 24 * 60);

  // Allocate break minutes: in-span first, then pre-span, then post-span
  let pre = preSpan;
  let mid = inSpan;
  let post = postSpan;
  let remainingBreak = breakMinutes;

  const subtractBreak = (key: "mid" | "pre" | "post") => {
    const map = { mid, pre, post };
    const cut = Math.min(map[key], remainingBreak);
    if (key === "mid") mid -= cut;
    if (key === "pre") pre -= cut;
    if (key === "post") post -= cut;
    remainingBreak -= cut;
  };

  subtractBreak("mid");
  subtractBreak("pre");
  subtractBreak("post");

  const workedMinutes = pre + mid + post; // actual worked time after break

  // -----------------------------------------------------------------
  // Raw classification before OT rounding and minimum-pay rules
  // -----------------------------------------------------------------

  let ordinaryMinutes = 0;
  let otSegments: number[] = []; // Used for non-PH overtime segments (pre, extra in-span, post)
  let sundayOTMinutesRaw = 0;
  let ph15Raw = 0;
  let ph25Raw = 0;

  if (isPH) {
    // Public Holiday:
    // mid minutes are 1.5x, pre+post minutes are 2.5x
    ph15Raw = mid;
    ph25Raw = pre + post;
  } else if (isSunday) {
    // Sunday:
    // All worked time is treated as 2.0x overtime
    sundayOTMinutesRaw = workedMinutes;
  } else if (isWeekend) {
    // Saturday:
    // All worked time is overtime (first 2 hours at 1.5x, remainder at 2.0x)
    otSegments = [pre, mid, post];
  } else {
    // Weekday (non-PH):
    // Up to 7 hours within span are ordinary; remainder + pre + post are overtime
    ordinaryMinutes = Math.min(mid, 7 * 60);
    const extraInSpanRaw = Math.max(0, mid - ordinaryMinutes);
    otSegments = [pre, extraInSpanRaw, post];
  }

  // -----------------------------------------------------------------
  // Overtime and Public Holiday penalties with segment-based rounding
  // -----------------------------------------------------------------

  let ot15Minutes = 0;
  let ot20Minutes = 0;
  let ph15Minutes = 0;
  let ph25Minutes = 0;

  if (isPH) {
    // Each PH segment rounded separately
    ph15Minutes = roundUpToQuarter(ph15Raw);
    ph25Minutes = roundUpToQuarter(ph25Raw);
  } else if (isSunday) {
    // Sunday: total overtime rounded as a single 2.0x bucket
    ot20Minutes = roundUpToQuarter(sundayOTMinutesRaw);
  } else if (isWeekend) {
    // Saturday: each OT segment rounded separately, then allocated
    const roundedSegments = otSegments.map(roundUpToQuarter);
    const otTotalRounded = roundedSegments.reduce((a, b) => a + b, 0);
    ot15Minutes = Math.min(120, otTotalRounded);   // first 2 hours at 1.5x
    ot20Minutes = Math.max(0, otTotalRounded - 120);
  } else {
    // Weekday overtime:
    // pre, extra in-span, and post segments rounded separately, then cut into 1.5x and 2.0x
    const roundedSegments = otSegments.map(roundUpToQuarter);
    const otTotalRounded = roundedSegments.reduce((a, b) => a + b, 0);
    ot15Minutes = Math.min(120, otTotalRounded);
    ot20Minutes = Math.max(0, otTotalRounded - 120);
  }

  // -----------------------------------------------------------------
  // Minimum 4-hour payment rule for Sunday and Public Holidays
  // -----------------------------------------------------------------

  let minimumRuleApplied = false;
  let paidMinutes = 0;

  if (isPH) {
    paidMinutes = ph15Minutes + ph25Minutes;
  } else if (isSunday) {
    paidMinutes = ot20Minutes;
  } else if (isWeekend) {
    paidMinutes = ot15Minutes + ot20Minutes;
  } else {
    paidMinutes = ordinaryMinutes + ot15Minutes + ot20Minutes;
  }

  if ((isPH || isSunday) && paidMinutes < 240) {
    minimumRuleApplied = true;
    const diff = 240 - paidMinutes;
    if (isPH) {
      // Add the shortfall to the highest PH penalty bucket (2.5x)
      ph25Minutes += diff;
    } else {
      // Sunday: add the shortfall to the 2.0x overtime bucket
      ot20Minutes += diff;
    }
    paidMinutes = 240;
  }

  // -----------------------------------------------------------------
  // Meal allowances (based on worked minutes, not paid minutes)
  // -----------------------------------------------------------------

  const workedHours = toHours(workedMinutes);

  let meals = 0;
  const mealRules: string[] = [];

  const startedBefore6 = !isPH && !isWeekend && start < 360; // before 06:00
  const finishedAfter18 = end > 1080; // after 18:00

  const ordinaryMinutesForWeekday = ordinaryMinutes;
  const extraInSpanForWeekday = Math.max(0, mid - ordinaryMinutesForWeekday);
  const otMinutesTotalForWeekday = pre + post + extraInSpanForWeekday;

  if (startedBefore6) {
    meals++;
    mealRules.push("Work commenced before 06:00 on a weekday.");
  }

  if (!isPH && !isWeekend && otMinutesTotalForWeekday > 120 && finishedAfter18) {
    meals++;
    mealRules.push("More than 2 hours overtime extending beyond 18:00 on a weekday.");
  }

  if (isWeekend && workedHours > 5) {
    meals = 1;
    mealRules.push("More than 5 hours worked on a weekend day.");
  }

  if (isPH && workedHours > 5) {
    meals = 1;
    mealRules.push("More than 5 hours worked on a public holiday.");
  }

  if (!isPH && !isWeekend && meals > 2) meals = 2;

  // -----------------------------------------------------------------
  // EA-style explanation
  // -----------------------------------------------------------------

  const fmt = (h: number) => `${Math.round(h * 100) / 100} h`;
  const explanationLines: string[] = [];

  explanationLines.push(
    `Day classification: ${dayOfWeek}${
      isPH ? " (Public Holiday)" : isWeekend ? " (Weekend)" : " (Weekday)"
    }.`
  );
  explanationLines.push(
    `Shift worked from ${startStr} to ${endStr}, with ${breakMinutes} minutes of unpaid break.`
  );

  if (minimumRuleApplied) {
    explanationLines.push(
      `\nMinimum 4-hour payment rule applied for Sunday / Public Holiday.`
    );
  }

  const paidHours = toHours(paidMinutes);
  explanationLines.push(
    `\nTotal payable hours after overtime rounding and minimum rules: ${fmt(paidHours)}.`
  );

  if (!isPH && !isWeekend) {
    explanationLines.push(
      `Ordinary Hours (Clauses 26.1–26.2): ${fmt(toHours(ordinaryMinutes))}.`
    );
    explanationLines.push(
      `Overtime 1.5× (Clause 27.2 first 2 hours): ${fmt(toHours(ot15Minutes))}.`
    );
    explanationLines.push(
      `Overtime 2.0× (Clause 27.2 thereafter): ${fmt(toHours(ot20Minutes))}.`
    );
  }

  if (!isPH && isSunday) {
    explanationLines.push(
      `Sunday overtime (Clause 27.3): ${fmt(toHours(ot20Minutes))} at 2.0×, rounded up to 15-minute blocks.`
    );
  }

  if (!isPH && isWeekend && !isSunday) {
    explanationLines.push(`Saturday overtime (Clause 27.2):`);
    explanationLines.push(
      `• 1.5× (first 2 hours) after rounding: ${fmt(toHours(ot15Minutes))}.`
    );
    explanationLines.push(
      `• 2.0× (thereafter) after rounding: ${fmt(toHours(ot20Minutes))}.`
    );
  }

  if (isPH) {
    explanationLines.push(`Public Holiday penalties (Clause 27.4) after rounding:`);
    explanationLines.push(
      `• ${fmt(toHours(ph15Minutes))} at 1.5× for hours within the 08:00–20:00 span.`
    );
    explanationLines.push(
      `• ${fmt(toHours(ph25Minutes))} at 2.5× for all other public holiday hours.`
    );
  }

  explanationLines.push(`Meal allowances (Clause 27.12): ${meals}.`);
  mealRules.forEach(r => explanationLines.push(`• ${r}`));

  explanationLines.push(
    `\nRelevant clauses applied: 26.1, 26.2, 27.1, 27.2, 27.3, 27.4, 27.12.`
  );

  const explanation = explanationLines.join("\n");

  return {
    dayOfWeek,
    isWeekend,
    isPublicHoliday: isPH,
    paidHours,
    ordinaryHours: toHours(ordinaryMinutes),
    overtime15: toHours(ot15Minutes),
    overtime20: toHours(ot20Minutes),
    publicHoliday15: toHours(ph15Minutes),
    publicHoliday25: toHours(ph25Minutes),
    minimumRuleApplied,
    mealAllowances: meals,
    mealRules,
    explanation
  };
}

/* -------------------------------------------------------------------
   UI Styling
---------------------------------------------------------------------*/

const GlobalStyle = () => (
  <style>{`
    body {
      background: #f4f6f9;
      margin: 0;
      font-family: Inter, system-ui, sans-serif;
    }

    .container {
      max-width: 900px;
      margin: auto;
      padding: 32px;
    }

    .header {
      font-size: 32px;
      font-weight: 800;
      margin-bottom: 28px;
      color: #1a1a1a;
      text-align: center;
    }

    .card {
      background: #ffffff;
      padding: 24px;
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.08);
      margin-bottom: 28px;
    }

    label {
      font-weight: 600;
      margin-bottom: 6px;
      color: #333;
    }

    .input-row {
      margin-bottom: 18px;
      display: flex;
      flex-direction: column;
    }

    input {
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid #c8c8c8;
      font-size: 15px;
    }

    button {
      padding: 12px 16px;
      background: #007bff;
      border: none;
      border-radius: 8px;
      color: white;
      cursor: pointer;
      margin-top: 12px;
      font-size: 16px;
      font-weight: 600;
    }

    button:hover {
      background: #005fcc;
    }

    .result-title {
      font-size: 20px;
      font-weight: 700;
      margin-bottom: 16px;
    }

    .explanation-box {
      white-space: pre-wrap;
      background: #f8fafc;
      padding: 18px;
      border-radius: 10px;
      border-left: 4px solid #007bff;
      font-size: 14px;
    }
  `}</style>
);

/* -------------------------------------------------------------------
   App Component
---------------------------------------------------------------------*/

function App() {
  const [date, setDate] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [breakMinutes, setBreakMinutes] = useState("0");
  const [result, setResult] = useState<CalculationResult | null>(null);

  const handleCalculate = () => {
    setResult(applyRules(date, start, end, breakMinutes));
  };

  return (
    <div className="container">
      <GlobalStyle />

      <div className="header">PayConfidence AI</div>

      {/* Input Panel */}
      <div className="card">
        <div className="input-row">
          <label>Date</label>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
          />
        </div>

        <div className="input-row">
          <label>Start Time</label>
          <input
            type="time"
            value={start}
            onChange={e => setStart(e.target.value)}
          />
        </div>

        <div className="input-row">
          <label>End Time</label>
          <input
            type="time"
            value={end}
            onChange={e => setEnd(e.target.value)}
          />
        </div>

        <div className="input-row">
          <label>Break (Minutes)</label>
          <input
            type="number"
            min={0}
            value={breakMinutes}
            onChange={e => setBreakMinutes(e.target.value)}
          />
        </div>

        <button onClick={handleCalculate}>Generate Interpretation</button>
      </div>

      {/* Results Panel */}
      {result && (
        <div className="card">
          <div className="result-title">Summary</div>

          <p>
            <strong>Day: </strong>
            {result.dayOfWeek}{" "}
            {result.isPublicHoliday
              ? "(Public Holiday)"
              : result.isWeekend
              ? "(Weekend)"
              : "(Weekday)"}
          </p>

          <p>
            <strong>Paid Hours: </strong>
            {result.paidHours} h
          </p>

          {result.minimumRuleApplied && (
            <p style={{ color: "red" }}>
              <strong>Minimum 4-hour rule applied (Sunday / Public Holiday).</strong>
            </p>
          )}

          {!result.isPublicHoliday && (
            <>
              <p>
                <strong>Ordinary Hours: </strong>
                {result.ordinaryHours} h
              </p>
              <p>
                <strong>OT 1.5×: </strong>
                {result.overtime15} h
              </p>
              <p>
                <strong>OT 2.0×: </strong>
                {result.overtime20} h
              </p>
            </>
          )}

          {result.isPublicHoliday && (
            <>
              <p>
                <strong>PH 1.5× Hours: </strong>
                {result.publicHoliday15} h
              </p>
              <p>
                <strong>PH 2.5× Hours: </strong>
                {result.publicHoliday25} h
              </p>
            </>
          )}

          <p>
            <strong>Meal Allowances: </strong>
            {result.mealAllowances}
          </p>

          <h3 style={{ marginTop: "24px" }}>Interpretation</h3>
          <div className="explanation-box">{result.explanation}</div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------
   Render
---------------------------------------------------------------------*/

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
