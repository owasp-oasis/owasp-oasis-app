import { useMemo, useState } from 'react'
import './FixCostCalculator.css'

type CalculatorValues = {
  humanHours: number
  hourlyRate: number
  overheadPct: number
  fixesPerYear: number
  automationRate: number
}

const defaults: CalculatorValues = {
  humanHours: 6,
  hourlyRate: 125,
  overheadPct: 40,
  fixesPerYear: 500,
  automationRate: 500,
}

const fields: {
  id: keyof CalculatorValues
  label: string
  hint: string
  min: number
  step: number
  prefix?: string
  suffix?: string
}[] = [
  {
    id: 'humanHours',
    label: 'Human time per fix',
    hint: 'Sum of all hands-on time across triage, fix, review, and merge.',
    min: 0,
    step: 0.5,
    suffix: 'hrs',
  },
  {
    id: 'hourlyRate',
    label: 'Fully loaded engineer rate',
    hint: 'Salary plus benefits and overhead, divided by working hours.',
    min: 0,
    step: 5,
    prefix: '$',
  },
  {
    id: 'overheadPct',
    label: 'Program overhead',
    hint: 'Tooling, CI/CD compute, management cycles, and release integration.',
    min: 0,
    step: 5,
    suffix: '%',
  },
  {
    id: 'fixesPerYear',
    label: 'Fixes per year',
    hint: 'Security findings your team remediates in a typical year.',
    min: 0,
    step: 50,
  },
  {
    id: 'automationRate',
    label: 'Fix automation rate',
    hint: 'Comparison benchmark for automated remediation.',
    min: 0,
    step: 50,
    prefix: '$',
  },
]

function money(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function pct(value: number): string {
  if (!Number.isFinite(value)) return '-'
  return `${Math.round(value)}%`
}

export default function FixCostCalculator() {
  const [values, setValues] = useState<CalculatorValues>(defaults)

  const results = useMemo(() => {
    const directLabor = values.humanHours * values.hourlyRate
    const allInPerFix = directLabor * (1 + values.overheadPct / 100)
    const annualCurrent = allInPerFix * values.fixesPerYear
    const annualAutomated = values.automationRate * values.fixesPerYear
    const prize = annualCurrent - annualAutomated
    const prizePct = annualCurrent > 0 ? (prize / annualCurrent) * 100 : 0

    return {
      directLabor,
      allInPerFix,
      annualCurrent,
      annualAutomated,
      prize,
      prizePct,
    }
  }, [values])

  function setField(field: keyof CalculatorValues, next: string) {
    setValues(current => ({
      ...current,
      [field]: Number.parseFloat(next) || 0,
    }))
  }

  return (
    <div className="calculator-page">
      <section className="calculator-hero">
        <div>
          <p className="calculator-eyebrow">OASIS calculator</p>
          <h1>Fully Loaded Fix Cost Calculator</h1>
          <p>
            Estimate the annual cost of your current security fix model and compare it
            with a fix automation benchmark.
          </p>
        </div>
        <button className="calculator-print" type="button" onClick={() => window.print()}>
          Print
        </button>
      </section>

      <section className="calculator-shell" aria-label="Fix cost calculator">
        <div className="calculator-inputs">
          <h2>Inputs</h2>
          <div className="calculator-field-list">
            {fields.map(field => (
              <label className="calculator-field" key={field.id}>
                <span>
                  <strong>{field.label}</strong>
                  <small>{field.hint}</small>
                </span>
                <span className="calculator-input-wrap">
                  {field.prefix && <span>{field.prefix}</span>}
                  <input
                    type="number"
                    min={field.min}
                    step={field.step}
                    value={values[field.id]}
                    onChange={event => setField(field.id, event.target.value)}
                  />
                  {field.suffix && <span>{field.suffix}</span>}
                </span>
              </label>
            ))}
          </div>
          <button className="calculator-reset" type="button" onClick={() => setValues(defaults)}>
            Reset defaults
          </button>
        </div>

        <div className="calculator-results">
          <h2>Results</h2>
          <div className="calculator-result calculator-result--highlight">
            <span>All-in cost per fix</span>
            <strong>{money(results.allInPerFix)}</strong>
          </div>
          <div className="calculator-result">
            <span>Direct labor per fix</span>
            <strong>{money(results.directLabor)}</strong>
          </div>
          <div className="calculator-result">
            <span>Annual cost at current model</span>
            <strong>{money(results.annualCurrent)}</strong>
          </div>
          <div className="calculator-result">
            <span>Annual cost at automation benchmark</span>
            <strong>{money(results.annualAutomated)}</strong>
          </div>
          <div className="calculator-result calculator-result--highlight calculator-result--green">
            <span>Size of the prize</span>
            <strong>{money(results.prize)}</strong>
          </div>
          <div className="calculator-result">
            <span>Share of current spend</span>
            <strong>{pct(results.prizePct)}</strong>
          </div>
        </div>
      </section>

      <section className="calculator-benchmarks">
        <h2>Benchmarks</h2>
        <div className="calculator-benchmark-grid">
          <div>
            <span>Mozilla CVE direct-labor floor</span>
            <strong>$7,220</strong>
            <small>AppSecAI, 2026</small>
          </div>
          <div>
            <span>Mozilla CVE all-in working budget</span>
            <strong>$10,000 to $12,000</strong>
            <small>AppSecAI, 2026</small>
          </div>
          <div>
            <span>Fix automation benchmark</span>
            <strong>{money(values.automationRate)}</strong>
            <small>Adjustable input</small>
          </div>
        </div>
      </section>

      <section className="calculator-method">
        <h2>Methodology</h2>
        <p>
          Direct labor per fix equals human hours per fix multiplied by the fully
          loaded hourly rate. All-in per fix equals direct labor multiplied by one
          plus the overhead percentage.
        </p>
        <p>
          Annualized cost equals all-in per fix multiplied by fixes per year.
          Size of the prize equals annualized cost at the current model minus
          annualized cost at the automation benchmark.
        </p>
        <p>
          This calculator supports the exercise from <em>Two Cycles, One Codebase</em>,
          Chapter 5, "This Week's Move."
        </p>
      </section>

      <footer className="calculator-footer">
        From <em>Two Cycles, One Codebase: How AI, Fix Automation, and OASIS Are
        Rewriting the Role of Application Security</em>. David Kosorok, Michael
        Cartsonis, and Chris Holt.
      </footer>
    </div>
  )
}
