param(
    [string]$BaseUrl = "http://127.0.0.1:8000",
    [switch]$StrictEnv,
    [switch]$SkipBackendChecks,
    [switch]$SkipFrontendBuild,
    [switch]$SkipHttpChecks,
    [switch]$KeepArtifacts
)

$ErrorActionPreference = "Stop"

$failures = New-Object System.Collections.Generic.List[string]
$warnings = New-Object System.Collections.Generic.List[string]

function Add-Failure {
    param([string]$Message)
    $failures.Add($Message) | Out-Null
    Write-Host "[FAIL] $Message" -ForegroundColor Red
}

function Add-Warning {
    param([string]$Message)
    $warnings.Add($Message) | Out-Null
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Add-Ok {
    param([string]$Message)
    Write-Host "[OK] $Message" -ForegroundColor Green
}

function Assert-PathExists {
    param(
        [string]$PathToCheck,
        [string]$Label
    )
    if (Test-Path $PathToCheck) {
        Add-Ok "$Label exists ($PathToCheck)"
    } else {
        Add-Failure "$Label missing ($PathToCheck)"
    }
}

function Read-DotEnv {
    param([string]$PathToEnv)
    $map = @{}
    if (-not (Test-Path $PathToEnv)) {
        return $map
    }
    foreach ($line in Get-Content -Path $PathToEnv) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }
        $idx = $trimmed.IndexOf("=")
        if ($idx -lt 1) {
            continue
        }
        $key = $trimmed.Substring(0, $idx).Trim()
        $value = $trimmed.Substring($idx + 1).Trim()
        $map[$key] = $value
    }
    return $map
}

function Require-EnvVar {
    param(
        [hashtable]$EnvMap,
        [string]$Name
    )
    $hasValue = $EnvMap.ContainsKey($Name) -and -not [string]::IsNullOrWhiteSpace($EnvMap[$Name])
    if ($hasValue) {
        Add-Ok "Env var set: $Name"
        return
    }
    if ($StrictEnv) {
        Add-Failure "Missing required env var: $Name"
    } else {
        Add-Warning "Missing env var: $Name"
    }
}

function Run-Command {
    param(
        [string]$Label,
        [scriptblock]$Block
    )
    try {
        & $Block
        Add-Ok $Label
    } catch {
        Add-Failure "$Label failed. $($_.Exception.Message)"
    }
}

function Cleanup-Artifacts {
    if ($KeepArtifacts) {
        Add-Warning "Keeping artifacts because -KeepArtifacts was provided."
        return
    }

    try {
        Get-ChildItem -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
            Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        Add-Ok "Removed __pycache__ folders"
    } catch {
        Add-Warning "Could not fully clean __pycache__ folders."
    }

    try {
        if (Test-Path "frontend\dist") {
            Remove-Item -Recurse -Force "frontend\dist" -ErrorAction SilentlyContinue
            Add-Ok "Removed frontend/dist"
        }
    } catch {
        Add-Warning "Could not remove frontend/dist."
    }
}

Write-Host "Pre-deploy verification started." -ForegroundColor Cyan
Write-Host "Workspace: $((Get-Location).Path)"
Write-Host ""

# Core file/folder checks
Assert-PathExists "backend" "Backend folder"
Assert-PathExists "frontend" "Frontend folder"
Assert-PathExists "alembic.ini" "Alembic config"
Assert-PathExists "render.yaml" "Render config"
Assert-PathExists "backend\main.py" "FastAPI app entry"
Assert-PathExists "frontend\package.json" "Frontend package"
Assert-PathExists ".env.example" "Env example"
Assert-PathExists ".env" "Env file"

# Environment checks
$envMap = Read-DotEnv ".env"
$requiredEnv = @(
    "DATABASE_URL",
    "SECRET_KEY",
    "GOOGLE_CLIENT_ID",
    "SENDGRID_API_KEY",
    "FROM_EMAIL",
    "ADMIN_EMAIL",
    "ADMIN_PANEL_EMAIL",
    "ADMIN_PANEL_PASSWORD_HASH"
)
foreach ($name in $requiredEnv) {
    Require-EnvVar -EnvMap $envMap -Name $name
}

if ($envMap.ContainsKey("DATABASE_URL") -and -not [string]::IsNullOrWhiteSpace($envMap["DATABASE_URL"])) {
    $dbUrl = $envMap["DATABASE_URL"].Trim().ToLowerInvariant()
    if ($dbUrl.StartsWith("postgres://") -or $dbUrl.StartsWith("postgresql://") -or $dbUrl.StartsWith("postgresql+psycopg2://")) {
        Add-Ok "DATABASE_URL looks like PostgreSQL"
    } else {
        if ($StrictEnv) {
            Add-Failure "DATABASE_URL does not look like PostgreSQL."
        } else {
            Add-Warning "DATABASE_URL does not look like PostgreSQL."
        }
    }
}

# Tool availability
if (Get-Command python -ErrorAction SilentlyContinue) {
    Add-Ok "python command available"
} else {
    Add-Failure "python command not found"
}

if (Get-Command npm -ErrorAction SilentlyContinue) {
    Add-Ok "npm command available"
} else {
    Add-Failure "npm command not found"
}

# Backend checks
if (-not $SkipBackendChecks) {
    Run-Command -Label "Backend compile check" -Block {
        python -m compileall backend alembic main.py | Out-Null
    }

    if ($envMap.ContainsKey("DATABASE_URL") -and -not [string]::IsNullOrWhiteSpace($envMap["DATABASE_URL"])) {
        $prevDatabaseUrl = $env:DATABASE_URL
        try {
            $env:DATABASE_URL = $envMap["DATABASE_URL"]
            Run-Command -Label "Backend import check" -Block {
                python -c "import backend.main; import backend.routers.auth; import backend.routers.chat; import backend.routers.admin; print('ok')" | Out-Null
            }
        } finally {
            $env:DATABASE_URL = $prevDatabaseUrl
        }
    } else {
        Add-Warning "Skipping backend import check because DATABASE_URL is not set."
    }
} else {
    Add-Warning "Skipped backend checks by flag."
}

# Frontend checks
if (-not $SkipFrontendBuild) {
    Run-Command -Label "Frontend production build" -Block {
        npm --prefix frontend run build | Out-Null
    }
} else {
    Add-Warning "Skipped frontend build by flag."
}

# HTTP endpoint checks
if (-not $SkipHttpChecks) {
    try {
        $healthResponse = Invoke-WebRequest -Uri "$BaseUrl/health" -Method Get -TimeoutSec 10
        if ($healthResponse.StatusCode -eq 200) {
            Add-Ok "GET /health returned 200 ($BaseUrl/health)"
        } else {
            Add-Failure "GET /health returned status $($healthResponse.StatusCode)"
        }
    } catch {
        Add-Warning "HTTP checks skipped. Could not reach running API at $BaseUrl."
    }

    try {
        $adminLoginResponse = Invoke-WebRequest -Uri "$BaseUrl/admin/login" -Method Get -TimeoutSec 10
        if ($adminLoginResponse.StatusCode -eq 200) {
            Add-Ok "GET /admin/login returned 200"
        } else {
            Add-Warning "GET /admin/login returned status $($adminLoginResponse.StatusCode)"
        }
    } catch {
        Add-Warning "Could not verify /admin/login endpoint at $BaseUrl."
    }
} else {
    Add-Warning "Skipped HTTP checks by flag."
}

Write-Host ""
if ($warnings.Count -gt 0) {
    Write-Host "Warnings ($($warnings.Count)):" -ForegroundColor Yellow
    foreach ($item in $warnings) {
        Write-Host " - $item"
    }
    Write-Host ""
}

if ($failures.Count -gt 0) {
    Cleanup-Artifacts
    Write-Host "Pre-deploy verification failed ($($failures.Count) issue(s))." -ForegroundColor Red
    foreach ($item in $failures) {
        Write-Host " - $item"
    }
    exit 1
}

Cleanup-Artifacts
Write-Host "Pre-deploy verification passed." -ForegroundColor Green
exit 0
