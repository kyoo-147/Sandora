param()

$ErrorActionPreference = 'Stop'

if ($env:HERDR_ENV -ne '1') {
    throw 'Start this script from a Herdr-managed pane. HERDR_ENV must equal 1.'
}

$bridgeDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$secureToken = $null
$tokenPointer = [IntPtr]::Zero

try {
    if ([string]::IsNullOrWhiteSpace($env:DISCORD_BOT_TOKEN)) {
        $secureToken = Read-Host 'Enter the RESET Discord bot token (input is hidden)' -AsSecureString
        $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
        $env:DISCORD_BOT_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    }

    Push-Location $bridgeDirectory
    try {
        npm start
    }
    finally {
        Pop-Location
    }
}
finally {
    Remove-Item Env:DISCORD_BOT_TOKEN -ErrorAction SilentlyContinue
    if ($tokenPointer -ne [IntPtr]::Zero) {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
}
