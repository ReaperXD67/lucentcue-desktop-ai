#Requires -Version 5.1
<#
.SYNOPSIS
Read-only Authenticode and payload coverage check for a LucentCue Windows release.
.DESCRIPTION
Does not execute the package, install certificates, or change Windows policy.
Provide the installed/extracted application layout and the exact publisher subject
confirmed during signing onboarding. An optional JSON report contains local paths.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$InstallerPath,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$AppDirectory,

    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string]$ExpectedPublisher,

    [string]$UninstallerPath,

    [string]$ReportPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($env:OS -ne 'Windows_NT') {
    throw 'This check requires Windows Authenticode verification.'
}

function Resolve-ReleaseFile([string]$Path) {
    $item = Get-Item -LiteralPath $Path -Force
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw "Expected a regular file without a reparse point: $Path"
    }
    return $item.FullName
}

function Get-NumericVersion([string]$Version) {
    if ($Version -notmatch '^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?(?:[-+].*)?$') {
        return $null
    }
    $revision = if ($Matches[4]) { [int]$Matches[4] } else { 0 }
    return '{0}.{1}.{2}.{3}' -f [int]$Matches[1], [int]$Matches[2], [int]$Matches[3], $revision
}

function Get-ReleaseSignature([string]$Path, [string]$Role, [bool]$ProjectBinary) {
    $signature = Get-AuthenticodeSignature -LiteralPath $Path
    $item = Get-Item -LiteralPath $Path
    $reasons = [System.Collections.Generic.List[string]]::new()
    $publisher = $null
    $thumbprint = $null
    $timestampPublisher = $null
    $codeSigning = $false
    if ($signature.SignerCertificate) {
        $publisher = $signature.SignerCertificate.Subject
        $thumbprint = $signature.SignerCertificate.Thumbprint
        foreach ($extension in $signature.SignerCertificate.Extensions) {
            if ($extension -is [Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]) {
                foreach ($usage in $extension.EnhancedKeyUsages) {
                    if ($usage.Value -eq '1.3.6.1.5.5.7.3.3') { $codeSigning = $true }
                }
            }
        }
    }
    if ($signature.TimeStamperCertificate) {
        $timestampPublisher = $signature.TimeStamperCertificate.Subject
    }
    if ($signature.Status -ne 'Valid') { $reasons.Add("Signature status: $($signature.Status)") }
    if (-not $signature.SignerCertificate -or -not $codeSigning) {
        $reasons.Add('Missing a signer certificate with the code signing EKU.')
    }
    if (-not $timestampPublisher) { $reasons.Add('Missing a trusted Authenticode timestamp certificate.') }
    if ($ProjectBinary) {
        if (-not [string]::Equals($publisher, $ExpectedPublisher, [StringComparison]::OrdinalIgnoreCase)) {
            $reasons.Add('Publisher does not match the exact approved certificate subject.')
        }
        if ($signature.SignatureType.ToString() -ne 'Authenticode') {
            $reasons.Add('Project executable needs an embedded Authenticode signature.')
        }
        if ($item.VersionInfo.ProductName -ne 'LucentCue') {
            $reasons.Add('Product name must be LucentCue.')
        }
        if (-not (Get-NumericVersion $item.VersionInfo.ProductVersion)) {
            $reasons.Add('Product version is missing or unsupported.')
        }
    }
    return [pscustomobject]@{
        role = $Role
        path = $Path
        sha256 = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
        productName = $item.VersionInfo.ProductName
        productVersion = $item.VersionInfo.ProductVersion
        signatureStatus = $signature.Status.ToString()
        signatureType = $signature.SignatureType.ToString()
        publisher = $publisher
        signerThumbprint = $thumbprint
        timestampPublisher = $timestampPublisher
        passed = $reasons.Count -eq 0
        failures = @($reasons.ToArray())
    }
}

$installer = Resolve-ReleaseFile $InstallerPath
$directory = Get-Item -LiteralPath $AppDirectory -Force
if (-not $directory.PSIsContainer -or ($directory.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
    throw 'AppDirectory must be a regular directory without a reparse point.'
}
$app = Resolve-ReleaseFile (Join-Path $directory.FullName 'LucentCue.exe')
if (-not $UninstallerPath) { $UninstallerPath = Join-Path $directory.FullName 'Uninstall LucentCue.exe' }
$uninstaller = Resolve-ReleaseFile $UninstallerPath
if (@($installer, $app, $uninstaller | Sort-Object -Unique).Count -ne 3) {
    throw 'Installer, application, and uninstaller must be three distinct files.'
}

$entries = [System.Collections.Generic.List[object]]::new()
$entries.Add((Get-ReleaseSignature $installer 'installer' $true))
$entries.Add((Get-ReleaseSignature $app 'application' $true))
$entries.Add((Get-ReleaseSignature $uninstaller 'uninstaller' $true))
$coverageFailures = [System.Collections.Generic.List[string]]::new()

# Walk explicitly so directory junctions/symlinks cannot escape the supplied layout.
$pending = [System.Collections.Generic.Stack[string]]::new()
$pending.Push($directory.FullName)
while ($pending.Count) {
    foreach ($item in Get-ChildItem -LiteralPath $pending.Pop() -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            $coverageFailures.Add("Payload contains a reparse point: $($item.FullName)")
        } elseif ($item.PSIsContainer) {
            $pending.Push($item.FullName)
        } elseif ($item.Extension.ToLowerInvariant() -in @('.exe', '.dll', '.node')) {
            if ($item.FullName -ne $app -and $item.FullName -ne $uninstaller) {
                $entries.Add((Get-ReleaseSignature $item.FullName 'payload' $false))
            }
        }
    }
}

$versions = @($entries | Where-Object { $_.role -ne 'payload' } |
    ForEach-Object { Get-NumericVersion $_.productVersion } | Sort-Object -Unique)
if ($versions.Count -ne 1) {
    $coverageFailures.Add('Installer, application, and uninstaller product versions differ.')
}
$failedFiles = @($entries | Where-Object { -not $_.passed })
$report = [pscustomobject]@{
    schemaVersion = 1
    checkedAtUtc = [DateTime]::UtcNow.ToString('o')
    expectedPublisher = $ExpectedPublisher
    passed = $failedFiles.Count -eq 0 -and $coverageFailures.Count -eq 0
    checkedFileCount = $entries.Count
    failures = @($coverageFailures.ToArray())
    files = @($entries.ToArray())
    limitation = 'Windows signature verification is not a verdict from the device Application Control policy. Installation and runtime checks are separate.'
}
$json = $report | ConvertTo-Json -Depth 8
if ($ReportPath) {
    # Create only the explicitly named report; never replace an existing report or executable.
    $reportStream = [IO.File]::Open([IO.Path]::GetFullPath($ReportPath), [IO.FileMode]::CreateNew)
    try {
        $bytes = [Text.UTF8Encoding]::new($false).GetBytes($json + [Environment]::NewLine)
        $reportStream.Write($bytes, 0, $bytes.Length)
    } finally {
        $reportStream.Dispose()
    }
}
$json
if (-not $report.passed) { exit 1 }
