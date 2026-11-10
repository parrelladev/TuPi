
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$projectPath = "D:\Programacao\TuPi"
$logPath = Join-Path $projectPath "tupi.log"
$errorPath = Join-Path $projectPath "tupi-error.log"
$tunnelService = "Cloudflared"

# Liga ou desliga o servico do Cloudflare Tunnel. Tenta direto; se o Windows
# negar por falta de permissao, pede elevacao (UAC) so para esse comando.
function Set-TunnelState([bool]$running) {
    $service = Get-Service -Name $tunnelService -ErrorAction SilentlyContinue
    if (-not $service) { return "Servico '$tunnelService' nao encontrado." }

    $target = if ($running) { 'Running' } else { 'Stopped' }
    if ($service.Status -eq $target) { return $null }

    try {
        if ($running) { Start-Service -Name $tunnelService -ErrorAction Stop }
        else { Stop-Service -Name $tunnelService -Force -ErrorAction Stop }
    }
    catch {
        $verb = if ($running) { 'Start-Service' } else { 'Stop-Service -Force' }
        try {
            Start-Process powershell.exe `
                -Verb RunAs `
                -WindowStyle Hidden `
                -Wait `
                -ArgumentList "-NoProfile -Command $verb -Name $tunnelService" `
                -ErrorAction Stop
        }
        catch {
            return "Permissao negada para alterar o tunel."
        }
    }

    try {
        $service.WaitForStatus($target, [TimeSpan]::FromSeconds(15))
        return $null
    }
    catch {
        return "O tunel nao ficou '$target' a tempo."
    }
}

# Liga o tunel antes do servidor
$tunnelError = Set-TunnelState $true

# Inicia o servidor oculto
$script:server = Start-Process `
    -FilePath $env:ComSpec `
    -ArgumentList '/d', '/c', 'npm start' `
    -WorkingDirectory $projectPath `
    -WindowStyle Hidden `
    -RedirectStandardOutput $logPath `
    -RedirectStandardError $errorPath `
    -PassThru

# Cria o icone na bandeja
$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = New-Object System.Drawing.Icon("D:\Programacao\TuPi\public\assets\favicon.ico")
$tray.Text = "TuPi - Servidor"
$tray.Visible = $true

# Menu do botao direito
$menu = New-Object System.Windows.Forms.ContextMenuStrip

$logs = $menu.Items.Add("Ver logs")
$logs.Add_Click({
    Start-Process powershell.exe -ArgumentList @(
        "-NoExit"
        "-Command"
        "Get-Content -LiteralPath '$logPath' -Tail 50 -Wait"
    )
})

$exit = $menu.Items.Add("Encerrar TuPi")
$exit.Add_Click({
    $script:context.ExitThread()
})

$tray.ContextMenuStrip = $menu

# Notificacao de inicializacao
$tray.BalloonTipTitle = "TuPi"
if ($tunnelError) {
    $tray.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::Warning
    $tray.BalloonTipText = "Servidor iniciado, mas o tunel falhou: $tunnelError"
}
else {
    $tray.BalloonTipText = "Servidor e tunel iniciados!"
}
$tray.ShowBalloonTip(2000)

# Monitora o processo
$script:context = New-Object System.Windows.Forms.ApplicationContext

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({
    $script:server.Refresh()
    if ($script:server.HasExited) {
        $script:context.ExitThread()
    }
})
$timer.Start()

try {
    [System.Windows.Forms.Application]::Run($script:context)
}
finally {
    $timer.Stop()

    if (-not $script:server.HasExited) {
        Start-Process taskkill.exe `
            -ArgumentList "/PID $($script:server.Id) /T /F" `
            -WindowStyle Hidden `
            -Wait
    }

    # Desliga o tunel ao encerrar (pelo menu ou se o servidor cair)
    [void](Set-TunnelState $false)

    $tray.Visible = $false
    $tray.Dispose()
    $menu.Dispose()
    $timer.Dispose()
}
