import { useEffect, useState } from "react";
import { Calculator as CalculatorIcon } from "lucide-react";
import {
  calendarBetween,
  countDifference,
  eligible,
  localToday,
  nextBirthday,
  parseDate,
  percentage,
} from "../lib/calculations";
import { errorMessage } from "../lib/files";
import {
  Field,
  Notice,
  NumberField,
  SelectField,
  Stats,
  Toggle,
  useReady,
} from "./shared";

const n = (value: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(value);
const readableDate = (value: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(value);
const date = (value: string) => {
  const parsed = parseDate(value);
  if (!parsed) throw Error("Enter valid dates to calculate.");
  return parsed;
};
export default function Calculator({ slug }: { slug: string }) {
  const ready = useReady();
  const age = slug === "age-calculator",
    eligibility = slug === "age-eligibility-calculator",
    marks = slug === "percentage-calculator",
    difference = slug === "date-difference-calculator";
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState(marks || eligibility ? "" : "10");
  const [third, setThird] = useState("");
  const [method, setMethod] = useState("manual");
  const [inclusive, setInclusive] = useState(false);
  const [result, setResult] = useState<{
    label: string;
    value: string;
    detail: string;
    stats?: Record<string, string>;
  }>();
  const [error, setError] = useState("");
  useEffect(() => {
    setEnd(localToday());
  }, []);
  function calculate() {
    setError("");
    setResult(undefined);
    try {
      if (age || eligibility) {
        const birth = date(start),
          asOf = date(end),
          actual = calendarBetween(birth, asOf);
        if (eligibility) {
          if (first === "" || second === "")
            throw Error(
              "Enter the minimum and maximum ages from the notification.",
            );
          const max = +second + (+third || 0);
          const passed = eligible(actual.years, +first, +second, +third);
          setResult({
            label: "Age eligibility",
            value: passed
              ? "Eligible for this age range"
              : "Outside this age range",
            detail:
              "On " +
              readableDate(asOf) +
              ", your completed years must be within " +
              first +
              " to " +
              max +
              ", inclusive.",
            stats: {
              "Completed years": String(actual.years),
              "Age relaxation": String(+third) + " years",
              "Adjusted maximum": String(max),
            },
          });
        } else {
          const birthday = nextBirthday(birth, asOf);
          setResult({
            label: "Age on " + readableDate(asOf),
            value:
              actual.years +
              " years, " +
              actual.months +
              " months, " +
              actual.days +
              " days",
            detail:
              "Based on completed calendar years and months. A leap-day birthday falls on February 28 in a non-leap year.",
            stats: {
              "Next birthday": readableDate(birthday),
              "Days since birth": n(actual.totalDays),
            },
          });
        }
      } else if (difference) {
        const actual = countDifference(date(start), date(end), inclusive);
        setResult({
          label: inclusive ? "Including the end date" : "Elapsed time",
          value: n(actual.totalDays) + " days",
          detail: "Months are counted from the start date using the calendar.",
          stats: {
            "Weeks and days":
              actual.weeks + " weeks, " + actual.daysAfterWeeks + " days",
            "Calendar months and days":
              actual.totalMonths + " months, " + actual.days + " days",
          },
        });
      } else if (marks) {
        if (first === "" || second === "")
          throw Error("Enter the obtained marks and total possible marks.");
        const actual = percentage(
          +first,
          +second,
          third === "" ? undefined : +third,
        );
        setResult({
          label: "Percentage",
          value: n(actual.value) + "%",
          detail: n(+first) + " ÷ " + n(+second) + " × 100",
          stats:
            actual.required === undefined
              ? undefined
              : {
                  ["Required for " + n(+third) + "%"]:
                    n(actual.required) + " marks",
                  "Additional marks needed": n(
                    Math.max(0, actual.required - +first),
                  ),
                },
        });
      } else {
        const scale = method === "cbse" ? 10 : +second,
          multiplier = method === "cbse" ? 9.5 : +third;
        if (
          first === "" ||
          ![+first, scale, multiplier].every(Number.isFinite) ||
          scale <= 0 ||
          +first < 0 ||
          +first > scale ||
          multiplier <= 0
        )
          throw Error(
            "Enter a CGPA within the scale and a positive multiplier.",
          );
        const value = +first * multiplier;
        if (value > 100)
          throw Error(
            "The formula produces more than 100%. Check the grading scale and multiplier.",
          );
        setResult({
          label: "Converted percentage",
          value: n(value) + "%",
          detail:
            n(+first) +
            " CGPA × " +
            n(multiplier) +
            " on a " +
            n(scale) +
            "-point scale.",
        });
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <div className="workspace" inert={!ready} aria-busy={!ready}>
      <form
        className="panel"
        onSubmit={(e) => {
          e.preventDefault();
          calculate();
        }}
        onChange={() => {
          setResult(undefined);
          setError("");
        }}
        noValidate
      >
        <h2>
          {age || eligibility || difference
            ? "Enter your dates"
            : "Enter your scores"}
        </h2>
        <div className="fields">
          {(age || eligibility || difference) && (
            <>
              <Field label={difference ? "Start date" : "Date of birth"}>
                <input
                  type="date"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                  required
                />
              </Field>
              <Field
                label={
                  difference
                    ? "End date"
                    : eligibility
                      ? "Exam cutoff date"
                      : "Age as of"
                }
              >
                <input
                  type="date"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                  required
                />
              </Field>
            </>
          )}
          {eligibility && (
            <>
              <NumberField
                label="Minimum age"
                value={first}
                onChange={setFirst}
              />
              <NumberField
                label="Maximum age"
                value={second}
                onChange={setSecond}
              />
              <NumberField
                label="Age relaxation (years, optional)"
                value={third}
                onChange={setThird}
                full
              />
            </>
          )}
          {difference && (
            <div className="full">
              <Toggle checked={inclusive} onChange={setInclusive}>
                Include the end date
              </Toggle>
            </div>
          )}
          {marks && (
            <>
              <NumberField
                label="Obtained marks"
                value={first}
                onChange={setFirst}
                step="any"
              />
              <NumberField
                label="Total marks"
                value={second}
                onChange={setSecond}
                step="any"
              />
              <NumberField
                label="Target percentage (optional)"
                value={third}
                onChange={setThird}
                max={100}
                step="any"
                full
              />
            </>
          )}
          {!age && !eligibility && !marks && !difference && (
            <>
              <SelectField
                label="Conversion formula"
                value={method}
                onChange={setMethod}
                options={{
                  manual: "Manual multiplier",
                  cbse: "CBSE Class X CCE (legacy)",
                }}
                full
              />
              <NumberField
                label="CGPA"
                value={first}
                onChange={setFirst}
                step="any"
              />
              {method === "manual" ? (
                <>
                  <NumberField
                    label="Grading scale"
                    value={second}
                    onChange={setSecond}
                    step="any"
                  />
                  <NumberField
                    label="Conversion multiplier"
                    value={third}
                    onChange={setThird}
                    step="any"
                    full
                  />
                </>
              ) : (
                <p className="hint">
                  10-point scale × 9.5.{" "}
                  <a
                    className="text-link"
                    href="https://www.cbse.gov.in/helpline/FAQs.pdf"
                  >
                    CBSE’s CCE guidance
                  </a>
                </p>
              )}
            </>
          )}
        </div>
        {eligibility && (
          <p className="hint mt-3">
            Enter relaxation only if your notification specifies it.
          </p>
        )}
        <div className="actions">
          <button className="button primary" type="submit">
            Calculate
          </button>
          <button
            className="button secondary"
            type="button"
            onClick={() => {
              setStart("");
              setEnd(localToday());
              setFirst("");
              setSecond(marks || eligibility ? "" : "10");
              setThird("");
              setMethod("manual");
              setInclusive(false);
              setError("");
              setResult(undefined);
            }}
          >
            Reset
          </button>
        </div>
        <Notice text={error} error />
      </form>
      <section className="panel" aria-label="Calculation results">
        <h2>Results</h2>
        {!result ? (
          <div className="empty-preview">
            <CalculatorIcon size={32} aria-hidden="true" />
            <strong>Your result appears here</strong>
            <span className="hint">
              Enter the details, then select Calculate.
            </span>
          </div>
        ) : (
          <div role="status">
            <div className="calculation-result">
              <p>{result.label}</p>
              <strong>{result.value}</strong>
              <p className="mt-2">{result.detail}</p>
            </div>
            {result.stats && <Stats items={result.stats} />}
          </div>
        )}
      </section>
    </div>
  );
}
