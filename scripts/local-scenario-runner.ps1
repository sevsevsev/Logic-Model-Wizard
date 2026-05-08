$baseJson = '{"intended_impact":{"population":"","geography":"","long_term_goal":"","compiled_statement":""},"stakeholders":[],"implementation":{"resources":{"human":[],"material":[],"financial":[],"knowledge":[]},"activities":[],"quality_fidelity":{"fidelity":[],"quality":[]}},"outcomes":{"short_term":[],"medium_term":[],"long_term":[]}}'

function New-ModelCopy() { return ($baseJson | ConvertFrom-Json) }

function Merge-Model($model, $patch) {
  if (-not $patch) { return $model }
  if ($patch.intended_impact) {
    foreach ($k in @('population','geography','long_term_goal','compiled_statement')) {
      $v = $patch.intended_impact.$k
      if ($null -ne $v -and [string]::IsNullOrWhiteSpace([string]$v) -eq $false) { $model.intended_impact.$k = [string]$v }
    }
  }
  if ($patch.stakeholders -and $patch.stakeholders.Count -gt 0) { $model.stakeholders = $patch.stakeholders }
  if ($patch.implementation) {
    if ($patch.implementation.resources) {
      foreach ($k in @('human','material','financial','knowledge')) {
        $arr = $patch.implementation.resources.$k
        if ($arr) { $model.implementation.resources.$k = $arr }
      }
    }
    if ($patch.implementation.activities) {
      $valid = @()
      foreach ($a in $patch.implementation.activities) {
        if ($a -and $a.item -and ($a.item -is [string])) { $valid += $a }
      }
      if ($valid.Count -gt 0) { $model.implementation.activities = $valid }
    }
  }
  if ($patch.outcomes) {
    foreach ($k in @('short_term','medium_term','long_term')) {
      if ($patch.outcomes.$k) { $model.outcomes.$k = $patch.outcomes.$k }
    }
  }
  return $model
}

function Run-Scenario($name, $turns) {
  $model = New-ModelCopy
  $history = @()
  Write-Output "`n=== $name ==="
  $turnIndex = 0
  foreach ($u in $turns) {
    $turnIndex++
    $bodyObj = @{ message = $u; history = $history; model = $model }
    $body = $bodyObj | ConvertTo-Json -Depth 25
    try {
      $resp = Invoke-RestMethod -Uri "http://localhost:3100/api/chat" -Method POST -Headers @{ 'Content-Type'='application/json'; 'x-user-id'='local-scenario-runner' } -Body $body -ErrorAction Stop
      $path = [string]$resp.llmMeta.path
      $fallback = [string]$resp.llmMeta.fallbackReason
      $intent = [string]$resp.llmMeta.trace.finalIntent
      $model = Merge-Model $model $resp.modelPatch
      $history += @{ role='user'; content=$u }
      $history += @{ role='assistant'; content=[string]$resp.reply }
      Write-Output ("T{0} path={1} fallback={2} intent={3}" -f $turnIndex, $path, ($(if($fallback){$fallback}else{'null'})), ($(if($intent){$intent}else{'null'})))
      Write-Output ("   impact: pop='{0}' geo='{1}' goal='{2}' compiled='{3}'" -f $model.intended_impact.population, $model.intended_impact.geography, $model.intended_impact.long_term_goal, $model.intended_impact.compiled_statement)
    } catch {
      Write-Output ("T{0} ERROR: {1}" -f $turnIndex, $_.Exception.Message)
    }
  }
  $ok = -not [string]::IsNullOrWhiteSpace($model.intended_impact.population) -and -not [string]::IsNullOrWhiteSpace($model.intended_impact.geography) -and -not [string]::IsNullOrWhiteSpace($model.intended_impact.long_term_goal)
  Write-Output ("FINAL => pop='{0}' | geo='{1}' | goal='{2}' | compiled='{3}' | coreFieldsComplete={4}" -f $model.intended_impact.population, $model.intended_impact.geography, $model.intended_impact.long_term_goal, $model.intended_impact.compiled_statement, $ok)
}

Run-Scenario "A. All-in-one + acceptance" @(
  "We serve middle school students in North Philadelphia. In 10 years we want them reading on grade level and transitioning successfully to high school.",
  "yes that captures it"
)

Run-Scenario "B. Stepwise short answers" @(
  "Middle school students.",
  "North Philadelphia.",
  "Students read on grade level and stay on track for high school graduation.",
  "yes"
)

Run-Scenario "C. Vague then refine" @(
  "We support youth.",
  "Specifically 6th to 8th grade students in Northeast Philadelphia public schools.",
  "Long-term we want sustained grade-level literacy and successful transition to high school.",
  "yes, use that wording"
)
