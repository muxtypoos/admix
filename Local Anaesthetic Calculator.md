**Weight —**

## 1. Patient

Weight (kg)

Height (m or cm), optional

Gender

Age (optional)

## 2. Airway topicalisation

None entered

Airway topicalisation (free text)

Or manual lidocaine used (mg)

Parsed total (mg)

0

## 3. Single agent maximum doses

Volumes rounded down to 0.1 ml. Amber = reduced by airway lidocaine. Red = no safe dose left.

## 4. Dual agent admixture

Agent 1

Agent 2

ml

Agent 1

+

ml

Agent 2

## “I have used” calculator

Already given some? Enter how much of each agent has been used so far. Leave blank for none.

Agent 1 used (ml)

Agent 2 used (ml)

## 5. Dilution

Available (higher)

Desired (lower)

Final volume (ml)

**🚨 6. LAST EMERGENCY: 20% LIPID**

STOP injecting · CALL FOR HELP · Airway + 100% O₂ · Get the LAST rescue kit

Guideline (tap image to zoom)

AAGBI 2010 severe local anaesthetic toxicity guidelineASRA 2020 local anaesthetic systemic toxicity checklist

Decision-support only. Verify all doses against local policy and clinical judgement. Intravascular injection can cause toxicity below maximum doses. Consider dose reduction in the elderly.

## Expert settings

Formulas & references

**LBW (kg, H in cm, W in kg, always capped at TBW):** Janmahasatian: M 9270W/(6680+216·BMI), F 9270W/(8780+244·BMI). Boer: M 0.407W+0.267H−19.2, F 0.252W+0.473H−48.3. James: M 1.1W−128(W/H)², F 1.07W−148(W/H)². Hume: M 0.3281W+0.33929H−29.5336, F 0.29569W+0.41813H−43.2933. Peters: 3.8×0.0215×W^0.6469×H^0.7236.

**Dosing weight:** TBW below the BMI threshold; between threshold and threshold+5 a linear blend towards LBW (adjusted weight, as in the source spreadsheet; the strict option switches straight to LBW at the threshold); LBW above (SOBA).

**Lidocaine pool** = total mg/kg LBW (max mg cap). Airway lidocaine used reduces it and the remaining fraction scales every agent's dosing weight.

**Max volume** (ml) = weight × mg/kg ÷ mg/ml. **Dual agents:** V1/Max1 + V2/Max2 ≤ 1. **Dilution:** V_high = C_low·V_final/C_high.

**LAST lipid emulsion 20% (W = weight in kg), AAGBI 2010:** bolus = 1.5 × W ml over 1 min; infusion = 15 × W ml/h. After 5 min if still unstable: up to two repeat boluses of the same dose, 5 min apart (maximum three boluses in total), and the infusion doubles to 30 × W ml/h. Maximum cumulative dose = 12 × W ml. (The AAGBI sheet's 70 kg example is rounded to 100 ml and 1000 ml/h; the calculator uses exact per-kg figures.)

**LAST, ASRA 2020 checklist:** over 70 kg (strictly over): bolus \~100 ml over 2–3 min, then \~250 ml over 15–20 min (≈750–1000 ml/h). 70 kg or under: bolus \~1.5 × W ml over 2–3 min, infusion \~0.25 × W ml/min (= 15 × W ml/h; consider a pump below 40 kg). If still unstable: repeat the bolus and double the infusion (30 × W ml/h under 70 kg, ≈1500–2000 ml/h over 70 kg). No fixed repeat limit is stated. Continue lipid for ≥15 min once haemodynamically stable. Maximum lipid dose = 12 × W ml. Epinephrine: start ≤1 mcg/kg.

**Default limits** are commonly quoted reference values within UK practice. Verify against local guidance and edit as required.

**Disclaimer:** UI entirely vibecoded in Claude Sonnet 5.5, based on a functional excel based applet. This calculator has been stress tested and double checked for accuracy. For feedback or questions please contact Dr George Lui ([george.lui@nhs.net](mailto:george.lui@nhs.net))